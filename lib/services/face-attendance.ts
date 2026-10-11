import "server-only";
import { randomUUID } from "node:crypto";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { matchFaces, proposeAttendance, type Proposal } from "@/lib/attendance/matching";
import { audit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { APP_TIMEZONE } from "@/lib/config";
import { db } from "@/lib/db";
import { forbidden, HttpError, notFound } from "@/lib/errors";
import { getFaceProvider } from "@/lib/face";
import { loadActiveSamples } from "@/lib/face/embeddings";
import { FaceQualityError } from "@/lib/face/provider";
import { rateLimit } from "@/lib/rate-limit";
import { warnLowAttendance } from "@/lib/services/notifications";
import { studentsOnLeave } from "@/lib/services/requests";
import { getSetting } from "@/lib/settings.server";
import { deletePrivateObjects, getPrivateObject, putPrivateObject } from "@/lib/storage";
import { addDays, isoWeekday, nowIn } from "@/lib/time";

/** How far back faculty may take (or first record) attendance. */
export const ATTENDANCE_WINDOW_DAYS = 14;
const MAX_PHOTOS_PER_UPLOAD = 3;
const MAX_PHOTOS_PER_SESSION = 6;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function assertOwnsSession(user: CurrentUser, facultyId: string) {
  if (user.role === "SUPER_ADMIN") return;
  if (user.role !== "FACULTY" || user.facultyProfile?.id !== facultyId) throw forbidden();
}

const today = () => nowIn(APP_TIMEZONE).date;

/** Students counted for a session: active accounts enrolled in its section + course. */
async function sessionRoster(sectionId: string, courseId: string) {
  const rows = await db.enrollment.findMany({
    where: { sectionId, courseId, student: { deletedAt: null, user: { isActive: true } } },
    orderBy: { student: { rollNumber: "asc" } },
    select: {
      student: {
        select: {
          id: true,
          userId: true,
          rollNumber: true,
          faceEnrolledAt: true,
          biometricOptOutAt: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  return rows.map((r) => r.student);
}

// ── Opening a session ───────────────────────────────────────────────────────

/**
 * The ClassSession for a class occurrence, created on first use. Weekly classes are
 * identified by (slotId, date); extra classes already have a session.
 */
export async function openSession(
  input: { slotId: string; date: Date } | { sessionId: string },
  user: CurrentUser,
): Promise<string> {
  const now = today();
  const earliest = addDays(now, -ATTENDANCE_WINDOW_DAYS);

  if ("sessionId" in input) {
    const session = await db.classSession.findUnique({ where: { id: input.sessionId } });
    if (!session) throw notFound("Class not found");
    assertOwnsSession(user, session.facultyId);
    if (session.status === "CANCELLED")
      throw new HttpError(400, "cancelled", "This class was cancelled.");
    if (session.date > now)
      throw new HttpError(400, "future", "Attendance can't be taken before the class.");
    return session.id;
  }

  const slot = await db.timetableSlot.findUnique({ where: { id: input.slotId } });
  if (!slot) throw notFound("Class not found");
  assertOwnsSession(user, slot.facultyId);
  const { date } = input;
  if (
    isoWeekday(date) !== slot.dayOfWeek ||
    date < slot.effectiveFrom ||
    (slot.effectiveTo && date > slot.effectiveTo)
  ) {
    throw new HttpError(400, "not_scheduled", "This class doesn't meet on that date.");
  }

  const existing = await db.classSession.findUnique({
    where: { timetableSlotId_date: { timetableSlotId: slot.id, date } },
  });
  if (existing) {
    if (existing.status === "CANCELLED")
      throw new HttpError(400, "cancelled", "This class was cancelled.");
    return existing.id;
  }
  if (date > now) throw new HttpError(400, "future", "Attendance can't be taken before the class.");
  if (date < earliest) {
    throw new HttpError(
      400,
      "too_old",
      `Attendance can only be recorded for the last ${ATTENDANCE_WINDOW_DAYS} days.`,
    );
  }
  if (await db.holiday.findFirst({ where: { date }, select: { id: true } })) {
    throw new HttpError(400, "holiday", "There are no classes on holidays.");
  }

  const created = await db.classSession.create({
    data: {
      timetableSlotId: slot.id,
      sectionId: slot.sectionId,
      courseId: slot.courseId,
      facultyId: slot.facultyId,
      roomId: slot.roomId,
      date,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
    },
  });
  return created.id;
}

async function loadOwnedSession(sessionId: string, user: CurrentUser) {
  const session = await db.classSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound("Class not found");
  assertOwnsSession(user, session.facultyId);
  return session;
}

// ── Photos ──────────────────────────────────────────────────────────────────

export type QueuedPhoto = { photoId: string; image: Blob };

/** Store classroom photos privately and queue them; process with processPhotos() afterwards. */
export async function uploadPhotos(
  sessionId: string,
  user: CurrentUser,
  files: File[],
): Promise<QueuedPhoto[]> {
  const session = await loadOwnedSession(sessionId, user);
  if (session.status === "CANCELLED")
    throw new HttpError(400, "cancelled", "This class was cancelled.");
  if (session.attendanceState === "FINALIZED") {
    throw new HttpError(
      409,
      "finalized",
      "Attendance is already confirmed. Edit it manually instead.",
    );
  }
  if (files.length === 0 || files.length > MAX_PHOTOS_PER_UPLOAD) {
    throw new HttpError(400, "photo_count", `Upload 1–${MAX_PHOTOS_PER_UPLOAD} photos at a time.`);
  }
  const existing = await db.attendancePhoto.count({ where: { sessionId } });
  if (existing + files.length > MAX_PHOTOS_PER_SESSION) {
    throw new HttpError(
      400,
      "photo_count",
      `A class can have at most ${MAX_PHOTOS_PER_SESSION} photos.`,
    );
  }
  for (const f of files) {
    if (!PHOTO_TYPES.has(f.type))
      throw new HttpError(415, "unsupported_type", "Use JPEG, PNG or WebP photos.");
    if (f.size > MAX_PHOTO_BYTES)
      throw new HttpError(413, "too_large", "Each photo must be under 10 MB.");
  }
  const limit = await rateLimit(`attendance-photos:${user.id}`, 30, 10 * 60);
  if (!limit.allowed)
    throw new HttpError(429, "rate_limited", "Too many uploads. Please wait a few minutes.");

  const queued: QueuedPhoto[] = [];
  for (const file of files) {
    const photoKey = `attendance/${sessionId}/${randomUUID()}`;
    await putPrivateObject(photoKey, new Uint8Array(await file.arrayBuffer()), file.type);
    const photo = await db.attendancePhoto.create({
      data: { sessionId, uploadedById: user.id, photoKey },
    });
    queued.push({ photoId: photo.id, image: file });
  }
  await db.classSession.update({
    where: { id: sessionId },
    data: { attendanceState: "PROCESSING" },
  });
  return queued;
}

/**
 * Detect and match faces in queued photos. Runs after the upload response (next/server
 * `after`). Each photo is matched one-to-one against the ACTIVE samples of the session's
 * roster; only the outcome (box, score, student, similarity) is stored.
 */
export async function processPhotos(sessionId: string, queued: QueuedPhoto[]) {
  const session = await db.classSession.findUniqueOrThrow({ where: { id: sessionId } });
  const roster = await sessionRoster(session.sectionId, session.courseId);
  const samples = await loadActiveSamples(roster.map((s) => s.userId));
  const candidates = roster.flatMap((s) => {
    const list = samples.get(s.userId);
    return list?.length ? [{ studentId: s.id, samples: list }] : [];
  });
  const [match, uncertain] = await Promise.all([
    getSetting("face.matchThreshold"),
    getSetting("face.uncertainThreshold"),
  ]);
  const provider = getFaceProvider();

  for (const { photoId, image } of queued) {
    await db.attendancePhoto.update({
      where: { id: photoId },
      data: { status: "PROCESSING", error: null },
    });
    try {
      const faces = await provider.embedAll(image);
      const matches = matchFaces(
        faces.map((f) => f.embedding),
        candidates,
        { match, uncertain },
      );
      await db.$transaction([
        db.detectedFace.deleteMany({ where: { photoId } }),
        db.detectedFace.createMany({
          data: matches.map((m) => ({
            photoId,
            box: faces[m.index].box,
            detectionScore: faces[m.index].score,
            studentId: m.studentId,
            similarity: m.similarity,
            status: m.status,
          })),
        }),
        db.attendancePhoto.update({
          where: { id: photoId },
          data: { status: "DONE", faceCount: faces.length },
        }),
      ]);
    } catch (err) {
      const message =
        err instanceof FaceQualityError
          ? err.message
          : "Processing failed. Try again or mark attendance manually.";
      if (!(err instanceof FaceQualityError))
        console.error("Attendance photo processing failed", photoId, err);
      await db.attendancePhoto.update({
        where: { id: photoId },
        data: { status: "FAILED", error: message },
      });
    }
  }

  // Ready for review once nothing is still queued (and nobody finalized meanwhile).
  const busy = await db.attendancePhoto.count({
    where: { sessionId, status: { in: ["PENDING", "PROCESSING"] } },
  });
  if (busy === 0) {
    await db.classSession.updateMany({
      where: { id: sessionId, attendanceState: "PROCESSING" },
      data: { attendanceState: "PENDING_REVIEW" },
    });
  }
}

/** Re-run a failed or stuck photo from the private bucket. */
export async function retryPhoto(photoId: string, user: CurrentUser): Promise<QueuedPhoto[]> {
  const photo = await db.attendancePhoto.findUnique({
    where: { id: photoId },
    include: { session: true },
  });
  if (!photo) throw notFound("Photo not found");
  assertOwnsSession(user, photo.session.facultyId);
  if (photo.session.attendanceState === "FINALIZED" || !photo.photoKey) {
    throw new HttpError(409, "finalized", "This photo can no longer be processed.");
  }
  const { body, contentType } = await getPrivateObject(photo.photoKey);
  await db.$transaction([
    db.attendancePhoto.update({ where: { id: photoId }, data: { status: "PENDING", error: null } }),
    db.classSession.update({
      where: { id: photo.sessionId },
      data: { attendanceState: "PROCESSING" },
    }),
  ]);
  return [{ photoId, image: new Blob([new Uint8Array(body)], { type: contentType }) }];
}

// ── Review ──────────────────────────────────────────────────────────────────

export type ReviewStudent = {
  id: string;
  rollNumber: string;
  name: string;
  faceStatus: "ENROLLED" | "OPTED_OUT" | "NOT_ENROLLED";
  proposal: Proposal;
  /** Current saved status, if attendance was confirmed before. */
  recorded: AttendanceStatus | null;
  /** Has an approved leave covering this class's date. */
  onLeave: boolean;
};

/** Everything the review screen needs. Contains no embeddings and no images. */
export async function sessionReview(sessionId: string, user: CurrentUser) {
  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    include: {
      course: { select: { code: true, name: true } },
      section: { select: { name: true, semesterNo: true, program: { select: { code: true } } } },
      room: { select: { code: true } },
      finalizedBy: { select: { name: true } },
      photos: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          error: true,
          faceCount: true,
          photoKey: true,
          createdAt: true,
          faces: {
            select: { id: true, box: true, status: true, studentId: true, similarity: true },
          },
        },
      },
      attendance: { select: { studentId: true, status: true } },
    },
  });
  if (!session) throw notFound("Class not found");
  assertOwnsSession(user, session.facultyId);

  const roster = await sessionRoster(session.sectionId, session.courseId);
  const detections = session.photos.flatMap((p) => p.faces);
  const proposals = proposeAttendance(
    roster.map((s) => s.id),
    detections,
  );
  const recorded = new Map(session.attendance.map((r) => [r.studentId, r.status]));
  const onLeave = await studentsOnLeave(
    roster.map((s) => s.id),
    session.date,
  );

  const students: ReviewStudent[] = roster.map((s) => ({
    id: s.id,
    rollNumber: s.rollNumber,
    name: s.user.name,
    faceStatus: s.faceEnrolledAt ? "ENROLLED" : s.biometricOptOutAt ? "OPTED_OUT" : "NOT_ENROLLED",
    proposal: proposals.get(s.id)!,
    recorded: recorded.get(s.id) ?? null,
    onLeave: onLeave.has(s.id),
  }));
  const rollById = new Map(roster.map((s) => [s.id, s.rollNumber]));

  return {
    session: {
      id: session.id,
      date: session.date,
      startMinute: session.startMinute,
      endMinute: session.endMinute,
      status: session.status,
      attendanceState: session.attendanceState,
      kind: session.kind,
      course: session.course,
      section: session.section,
      room: session.room?.code ?? null,
      finalizedBy: session.finalizedBy?.name ?? null,
      finalizedAt: session.finalizedAt,
    },
    photos: session.photos.map(({ photoKey, faces, ...p }) => ({
      ...p,
      stored: photoKey !== null,
      faces: faces.map((f) => ({
        id: f.id,
        box: f.box as [number, number, number, number],
        status: f.status,
        similarity: f.similarity,
        rollNumber: f.studentId ? (rollById.get(f.studentId) ?? null) : null,
      })),
    })),
    students,
    unmatchedFaces: detections.filter((d) => d.status === "UNMATCHED").length,
  };
}

// ── Finalize ────────────────────────────────────────────────────────────────

/**
 * Save the confirmed attendance. Nothing counts until this runs.
 * - method FACE (with confidence) when the faculty kept a face detection as present/late
 * - every deviation from the face proposal, and every change to a previously confirmed
 *   record, is audit-logged as an override
 * Classroom photos are deleted from storage afterwards.
 */
export async function finalizeAttendance(
  sessionId: string,
  user: CurrentUser,
  statuses: Map<string, AttendanceStatus>,
) {
  const review = await sessionReview(sessionId, user);
  const { session } = review;
  if (session.status === "CANCELLED")
    throw new HttpError(400, "cancelled", "This class was cancelled.");
  if (session.attendanceState === "PROCESSING") {
    throw new HttpError(
      409,
      "processing",
      "Photos are still being processed. Wait a moment and try again.",
    );
  }
  const missing = review.students.filter((s) => !statuses.has(s.id));
  if (missing.length) {
    throw new HttpError(
      400,
      "incomplete",
      `Choose a status for every student (${missing.length} left).`,
    );
  }

  const hadPhotos = review.photos.some((p) => p.status === "DONE");
  const now = new Date();
  const overrides: { studentId: string; from: string; to: AttendanceStatus; reason: string }[] = [];

  const writes = review.students.map((s) => {
    const status = statuses.get(s.id)!;
    const present = status === "PRESENT" || status === "LATE";
    const fromFace = present && s.proposal.source !== "NONE";

    if (s.recorded && s.recorded !== status) {
      overrides.push({
        studentId: s.id,
        from: s.recorded,
        to: status,
        reason: "edited_after_confirmation",
      });
    } else if (!s.recorded && hadPhotos) {
      if (s.proposal.source === "FACE" && !present) {
        overrides.push({
          studentId: s.id,
          from: "FACE_MATCH",
          to: status,
          reason: "face_match_rejected",
        });
      } else if (s.proposal.source === "NONE" && present) {
        overrides.push({
          studentId: s.id,
          from: "NOT_DETECTED",
          to: status,
          reason: "marked_present_manually",
        });
      }
    }

    const data = {
      status,
      method: fromFace ? ("FACE" as const) : ("MANUAL" as const),
      confidence: fromFace ? s.proposal.similarity : null,
      markedById: user.id,
      confirmedById: user.id,
      confirmedAt: now,
    };
    return db.attendanceRecord.upsert({
      where: { sessionId_studentId: { sessionId, studentId: s.id } },
      create: { sessionId, studentId: s.id, ...data },
      update: data,
    });
  });

  const photoKeys = await db.attendancePhoto.findMany({
    where: { sessionId, photoKey: { not: null } },
    select: { photoKey: true },
  });
  await db.$transaction([
    ...writes,
    db.classSession.update({
      where: { id: sessionId },
      data: {
        attendanceState: "FINALIZED",
        status: "COMPLETED",
        finalizedById: user.id,
        finalizedAt: now,
      },
    }),
    db.attendancePhoto.updateMany({ where: { sessionId }, data: { photoKey: null } }),
  ]);
  await deletePrivateObjects(photoKeys.map((p) => p.photoKey!));

  await audit({
    actorId: user.id,
    action: "attendance.finalized",
    entityType: "ClassSession",
    entityId: sessionId,
    metadata: {
      students: review.students.length,
      present: [...statuses.values()].filter((s) => s === "PRESENT" || s === "LATE").length,
      photos: review.photos.length,
      overrides: overrides.length,
    },
  });
  for (const o of overrides) {
    await audit({
      actorId: user.id,
      action: "attendance.overridden",
      entityType: "AttendanceRecord",
      entityId: `${sessionId}:${o.studentId}`,
      metadata: o,
    });
  }
  const sessionRow = await db.classSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { sectionId: true, courseId: true },
  });
  await warnLowAttendance(sessionRow.sectionId, sessionRow.courseId);
}

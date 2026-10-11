import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { ownStudentId } from "@/lib/auth/scope";
import { correctionProblem, dateRangesOverlap, leaveDateProblems } from "@/lib/communication/rules";
import { APP_TIMEZONE } from "@/lib/config";
import { db } from "@/lib/db";
import { FieldValidationError, forbidden, HttpError, notFound } from "@/lib/errors";
import { notify } from "@/lib/services/notifications";
import { nowIn } from "@/lib/time";
import type {
  correctionRequestSchema,
  leaveRequestSchema,
  reviewSchema,
} from "@/lib/validators/communication";

const today = () => nowIn(APP_TIMEZONE).date;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** User ids of faculty teaching any course in a section. */
async function sectionFacultyUserIds(sectionId: string | null) {
  if (!sectionId) return [];
  const rows = await db.facultyAssignment.findMany({
    where: { sectionId },
    select: { faculty: { select: { userId: true } } },
    distinct: ["facultyId"],
  });
  return rows.map((r) => r.faculty.userId);
}

// ── Leave ───────────────────────────────────────────────────────────────────

export async function createLeave(input: z.output<typeof leaveRequestSchema>, user: CurrentUser) {
  const studentId = ownStudentId(user);
  const problems = leaveDateProblems(input.fromDate, input.toDate, today());
  if (problems.length) throw new FieldValidationError({ toDate: problems });

  const existing = await db.leaveRequest.findMany({
    where: { studentId, status: { in: ["PENDING", "APPROVED"] } },
    select: { fromDate: true, toDate: true },
  });
  if (existing.some((l) => dateRangesOverlap(input.fromDate, input.toDate, l.fromDate, l.toDate))) {
    throw new FieldValidationError({
      fromDate: ["You already have a leave request covering some of these dates"],
    });
  }

  const leave = await db.leaveRequest.create({ data: { studentId, ...input } });
  await notify(await sectionFacultyUserIds(user.studentProfile!.sectionId), {
    type: "LEAVE_REQUEST",
    title: `Leave request from ${user.name} (${user.loginId})`,
    body: `${isoDate(input.fromDate)} to ${isoDate(input.toDate)}`,
    link: "/faculty/requests",
  });
  return leave;
}

export async function cancelOwnRequest(
  kind: "leave" | "correction",
  requestId: string,
  user: CurrentUser,
) {
  const studentId = ownStudentId(user);
  const where = { id: requestId, studentId, status: "PENDING" as const };
  const result =
    kind === "leave"
      ? await db.leaveRequest.updateMany({ where, data: { status: "CANCELLED" } })
      : await db.attendanceCorrectionRequest.updateMany({ where, data: { status: "CANCELLED" } });
  if (result.count === 0)
    throw new HttpError(409, "not_pending", "Only your pending requests can be cancelled.");
}

/** Admin: any request. Faculty: students of sections they teach. */
async function assertCanReviewLeave(user: CurrentUser, studentSectionId: string | null) {
  if (user.role === "SUPER_ADMIN") return;
  if (user.role !== "FACULTY" || !user.facultyProfile || !studentSectionId) throw forbidden();
  const teaches = await db.facultyAssignment.findFirst({
    where: { facultyId: user.facultyProfile.id, sectionId: studentSectionId },
    select: { id: true },
  });
  if (!teaches) throw forbidden();
}

/**
 * Approve/reject a leave. Approval turns the student's confirmed ABSENT records in the
 * period into EXCUSED (each change audited); classes taken later default to Excused too.
 */
export async function reviewLeave(input: z.output<typeof reviewSchema>, user: CurrentUser) {
  const leave = await db.leaveRequest.findUnique({
    where: { id: input.requestId },
    include: { student: { select: { id: true, userId: true, sectionId: true } } },
  });
  if (!leave) throw notFound("Request not found");
  await assertCanReviewLeave(user, leave.student.sectionId);
  if (leave.status !== "PENDING")
    throw new HttpError(409, "decided", "This request has already been decided.");

  const now = new Date();
  await db.leaveRequest.update({
    where: { id: leave.id },
    data: {
      status: input.decision,
      reviewedById: user.id,
      reviewedAt: now,
      reviewerNote: input.note,
    },
  });

  let excused = 0;
  if (input.decision === "APPROVED") {
    const records = await db.attendanceRecord.findMany({
      where: {
        studentId: leave.studentId,
        status: "ABSENT",
        session: { attendanceState: "FINALIZED", date: { gte: leave.fromDate, lte: leave.toDate } },
      },
      select: { id: true, sessionId: true },
    });
    if (records.length) {
      await db.attendanceRecord.updateMany({
        where: { id: { in: records.map((r) => r.id) } },
        data: { status: "EXCUSED", confirmedById: user.id, confirmedAt: now },
      });
      for (const r of records) {
        await audit({
          actorId: user.id,
          action: "attendance.overridden",
          entityType: "AttendanceRecord",
          entityId: `${r.sessionId}:${leave.studentId}`,
          metadata: {
            from: "ABSENT",
            to: "EXCUSED",
            reason: "leave_approved",
            leaveRequestId: leave.id,
          },
        });
      }
      excused = records.length;
    }
  }

  await notify([leave.student.userId], {
    type: "LEAVE_REQUEST",
    title: `Leave ${input.decision === "APPROVED" ? "approved" : "rejected"} (${isoDate(leave.fromDate)} to ${isoDate(leave.toDate)})`,
    body:
      input.note ??
      (excused
        ? `${excused} recorded absence${excused === 1 ? "" : "s"} marked as excused.`
        : null),
    link: "/student/requests",
  });
  return { excused };
}

// ── Attendance corrections ──────────────────────────────────────────────────

export async function createCorrection(
  input: z.output<typeof correctionRequestSchema>,
  user: CurrentUser,
) {
  const studentId = ownStudentId(user);
  const record = await db.attendanceRecord.findUnique({
    where: { sessionId_studentId: { sessionId: input.sessionId, studentId } },
    include: {
      session: {
        select: {
          date: true,
          attendanceState: true,
          course: { select: { code: true } },
          faculty: { select: { userId: true } },
        },
      },
    },
  });
  if (!record) throw notFound("No attendance is recorded for you in that class.");
  const problem = correctionProblem(
    {
      status: record.status,
      sessionDate: record.session.date,
      finalized: record.session.attendanceState === "FINALIZED",
    },
    input.requestedStatus,
    today(),
  );
  if (problem) throw new HttpError(400, "not_allowed", problem);
  const pending = await db.attendanceCorrectionRequest.findFirst({
    where: { studentId, sessionId: input.sessionId, status: "PENDING" },
    select: { id: true },
  });
  if (pending)
    throw new HttpError(409, "duplicate", "You already have a pending request for this class.");

  const req = await db.attendanceCorrectionRequest.create({
    data: {
      studentId,
      sessionId: input.sessionId,
      attendanceRecordId: record.id,
      requestedStatus: input.requestedStatus,
      reason: input.reason,
    },
  });
  await notify([record.session.faculty.userId], {
    type: "CORRECTION_REQUEST",
    title: `Attendance correction: ${record.session.course.code} on ${isoDate(record.session.date)}`,
    body: `${user.name} (${user.loginId}) asks for ${input.requestedStatus.toLowerCase()} instead of ${record.status.toLowerCase()}.`,
    link: "/faculty/requests",
  });
  return req;
}

/** Admin: any. Faculty: only corrections for classes they taught. Approval updates the record (audited). */
export async function reviewCorrection(input: z.output<typeof reviewSchema>, user: CurrentUser) {
  const req = await db.attendanceCorrectionRequest.findUnique({
    where: { id: input.requestId },
    include: {
      session: {
        select: { id: true, facultyId: true, date: true, course: { select: { code: true } } },
      },
      student: { select: { userId: true } },
    },
  });
  if (!req) throw notFound("Request not found");
  if (
    user.role !== "SUPER_ADMIN" &&
    (user.role !== "FACULTY" || user.facultyProfile?.id !== req.session.facultyId)
  ) {
    throw forbidden();
  }
  if (req.status !== "PENDING")
    throw new HttpError(409, "decided", "This request has already been decided.");

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.attendanceCorrectionRequest.update({
      where: { id: req.id },
      data: {
        status: input.decision,
        reviewedById: user.id,
        reviewedAt: now,
        reviewerNote: input.note,
      },
    });
    if (input.decision === "APPROVED") {
      const record = await tx.attendanceRecord.findUniqueOrThrow({
        where: { sessionId_studentId: { sessionId: req.sessionId, studentId: req.studentId } },
      });
      await tx.attendanceRecord.update({
        where: { id: record.id },
        data: {
          status: req.requestedStatus,
          method: "MANUAL",
          confidence: null,
          confirmedById: user.id,
          confirmedAt: now,
        },
      });
      await audit({
        actorId: user.id,
        action: "attendance.overridden",
        entityType: "AttendanceRecord",
        entityId: `${req.sessionId}:${req.studentId}`,
        metadata: {
          from: record.status,
          to: req.requestedStatus,
          reason: "correction_approved",
          correctionRequestId: req.id,
        },
      });
    }
  });

  await notify([req.student.userId], {
    type: "CORRECTION_REQUEST",
    title: `Correction ${input.decision === "APPROVED" ? "approved" : "rejected"}: ${req.session.course.code} on ${isoDate(req.session.date)}`,
    body: input.note,
    link: "/student/requests",
  });
}

// ── Listings ────────────────────────────────────────────────────────────────

const studentSelect = {
  select: {
    rollNumber: true,
    user: { select: { name: true } },
    section: { select: { name: true, semesterNo: true, program: { select: { code: true } } } },
  },
} as const;

/** Requests the user may see: own (student), their sections/classes (faculty), all (admin). */
export async function listRequests(user: CurrentUser, status: "PENDING" | "DECIDED") {
  const statusFilter =
    status === "PENDING" ? { status: "PENDING" as const } : { status: { not: "PENDING" as const } };
  let leaveWhere: Prisma.LeaveRequestWhereInput = statusFilter;
  let correctionWhere: Prisma.AttendanceCorrectionRequestWhereInput = statusFilter;

  if (user.role === "STUDENT") {
    const studentId = ownStudentId(user);
    leaveWhere = { ...statusFilter, studentId };
    correctionWhere = { ...statusFilter, studentId };
  } else if (user.role === "FACULTY") {
    const facultyId = user.facultyProfile!.id;
    leaveWhere = {
      ...statusFilter,
      student: { section: { assignments: { some: { facultyId } } } },
    };
    correctionWhere = { ...statusFilter, session: { facultyId } };
  }

  const order = { createdAt: status === "PENDING" ? ("asc" as const) : ("desc" as const) };
  const [leaves, corrections] = await Promise.all([
    db.leaveRequest.findMany({
      where: leaveWhere,
      orderBy: order,
      take: 100,
      include: { student: studentSelect, reviewedBy: { select: { name: true } } },
    }),
    db.attendanceCorrectionRequest.findMany({
      where: correctionWhere,
      orderBy: order,
      take: 100,
      include: {
        student: studentSelect,
        reviewedBy: { select: { name: true } },
        session: { select: { date: true, startMinute: true, course: { select: { code: true } } } },
        attendanceRecord: { select: { status: true } },
      },
    }),
  ]);
  return { leaves, corrections };
}

/** Students on approved leave on a date (used by the attendance review screen). */
export async function studentsOnLeave(studentIds: string[], date: Date) {
  if (studentIds.length === 0) return new Set<string>();
  const rows = await db.leaveRequest.findMany({
    where: {
      studentId: { in: studentIds },
      status: "APPROVED",
      fromDate: { lte: date },
      toDate: { gte: date },
    },
    select: { studentId: true },
  });
  return new Set(rows.map((r) => r.studentId));
}

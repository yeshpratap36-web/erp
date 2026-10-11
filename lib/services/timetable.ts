import "server-only";
import type { z } from "zod";
import type { CurrentUser } from "@/lib/auth/session";
import { APP_TIMEZONE } from "@/lib/config";
import { db } from "@/lib/db";
import { forbidden, HttpError, notFound } from "@/lib/errors";
import { enrolledUserIds, notify } from "@/lib/services/notifications";
import {
  findBookingClashes,
  findSlotClashes,
  type Booking,
  type ClashResource,
} from "@/lib/timetable/clash";
import { expandOccurrences, type Occurrence } from "@/lib/timetable/occurrences";
import { isoWeekday, minutesToHHMM, nowIn, WEEKDAY_SHORT } from "@/lib/time";
import type { cancelClassSchema, extraClassSchema, slotSchema } from "@/lib/validators/timetable";

// ── Display helpers ─────────────────────────────────────────────────────────

const displayInclude = {
  course: { select: { id: true, code: true, name: true } },
  section: {
    select: { id: true, name: true, semesterNo: true, program: { select: { code: true } } },
  },
  faculty: { select: { id: true, user: { select: { name: true } } } },
  room: { select: { id: true, code: true } },
} as const;

type SectionLabelInput = { name: string; semesterNo: number; program: { code: string } };
export const sectionLabel = (s: SectionLabelInput) => `${s.program.code} ${s.semesterNo}${s.name}`;

const RESOURCE_LABEL: Record<ClashResource, string> = {
  room: "Room",
  faculty: "Faculty",
  section: "Section",
};

type ClashTarget = { startMinute: number; endMinute: number; courseCode: string; section: string };

function describeClash(resources: ClashResource[], other: ClashTarget, when: string) {
  const what = resources.map((r) => RESOURCE_LABEL[r]).join(", ");
  return `${what} already booked ${when} ${minutesToHHMM(other.startMinute)}–${minutesToHHMM(other.endMinute)} (${other.courseCode}, ${other.section})`;
}

/** Display fields of a slot/session row loaded with `displayInclude`. */
const clashTarget = (row: {
  startMinute: number;
  endMinute: number;
  course: { code: string };
  section: SectionLabelInput;
}): ClashTarget => ({ ...row, courseCode: row.course.code, section: sectionLabel(row.section) });

function clashError(messages: string[]) {
  return new HttpError(409, "clash", `Timetable clash: ${messages.join("; ")}.`);
}

/** Admin: any faculty. Faculty: only themselves. */
function assertManagesFaculty(user: CurrentUser, facultyId: string) {
  if (user.role === "SUPER_ADMIN") return;
  if (user.role !== "FACULTY" || user.facultyProfile?.id !== facultyId) throw forbidden();
}

const today = () => nowIn(APP_TIMEZONE).date;

// ── Weekly slots (admin) ────────────────────────────────────────────────────

export async function createSlot(input: z.output<typeof slotSchema>) {
  const assignment = await db.facultyAssignment.findUnique({
    where: { id: input.assignmentId },
    include: { section: { include: { semester: true } } },
  });
  if (!assignment) throw notFound("Course assignment not found");
  const room = await db.room.findUnique({ where: { id: input.roomId }, select: { id: true } });
  if (!room) throw notFound("Room not found");

  const { semester } = assignment.section;
  const candidate = {
    sectionId: assignment.sectionId,
    facultyId: assignment.facultyId,
    roomId: input.roomId,
    dayOfWeek: input.dayOfWeek,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
    effectiveFrom: semester.startDate,
    effectiveTo: semester.endDate,
  };

  // Plain filters valid for both TimetableSlot and ClassSession.
  const sharesResource = [
    { roomId: candidate.roomId },
    { facultyId: candidate.facultyId },
    { sectionId: candidate.sectionId },
  ];
  const [slots, extras] = await Promise.all([
    db.timetableSlot.findMany({
      where: {
        dayOfWeek: candidate.dayOfWeek,
        effectiveFrom: { lte: candidate.effectiveTo },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: candidate.effectiveFrom } }],
        AND: [{ OR: sharesResource }],
      },
      include: displayInclude,
    }),
    // One-off classes already booked on this weekday during the term.
    db.classSession.findMany({
      where: {
        timetableSlotId: null,
        status: { not: "CANCELLED" },
        date: { gte: candidate.effectiveFrom, lte: candidate.effectiveTo },
        OR: sharesResource,
      },
      include: displayInclude,
    }),
  ]);

  const messages = [
    ...findSlotClashes(candidate, slots).map((c) =>
      describeClash(c.resources, clashTarget(c.with), `every ${WEEKDAY_SHORT[c.with.dayOfWeek]}`),
    ),
    ...findBookingClashes(
      candidate,
      extras.filter((e) => isoWeekday(e.date) === candidate.dayOfWeek),
    ).map((c) =>
      describeClash(
        c.resources,
        clashTarget(c.with),
        `on ${c.with.date.toISOString().slice(0, 10)}`,
      ),
    ),
  ];
  if (messages.length) throw clashError(messages);

  return db.timetableSlot.create({
    data: { ...candidate, courseId: assignment.courseId, type: input.type },
  });
}

/**
 * Remove a weekly slot. Upcoming cancellations/placeholders are removed with it; sessions
 * that already have attendance stay as history (their slot link becomes null).
 */
export async function deleteSlot(slotId: string) {
  const slot = await db.timetableSlot.findUnique({ where: { id: slotId }, select: { id: true } });
  if (!slot) throw notFound("Slot not found");
  await db.$transaction([
    db.classSession.deleteMany({
      where: { timetableSlotId: slotId, attendanceState: "NOT_TAKEN" },
    }),
    db.timetableSlot.delete({ where: { id: slotId } }),
  ]);
}

// ── Schedules ───────────────────────────────────────────────────────────────

export type ScheduleScope =
  | { facultyId: string }
  | { sectionId: string }
  /** A student's enrolled (section, course) pairs. */
  | { enrollments: { sectionId: string; courseId: string }[] };

export type OccurrenceView = Occurrence & {
  course: { code: string; name: string };
  section: string;
  room: string | null;
  faculty: string;
};

function scopeWhere(scope: ScheduleScope) {
  if ("facultyId" in scope) return { facultyId: scope.facultyId };
  if ("sectionId" in scope) return { sectionId: scope.sectionId };
  return { OR: scope.enrollments.map((e) => ({ sectionId: e.sectionId, courseId: e.courseId })) };
}

/** Dated classes (weekly slots expanded + one-off sessions) for a scope and date range. */
export async function getOccurrences(
  scope: ScheduleScope,
  from: Date,
  to: Date,
): Promise<OccurrenceView[]> {
  if ("enrollments" in scope && scope.enrollments.length === 0) return [];
  const where = scopeWhere(scope);

  const [slots, sessions, holidays] = await Promise.all([
    db.timetableSlot.findMany({
      where: {
        ...where,
        effectiveFrom: { lte: to },
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] }],
      },
      include: displayInclude,
    }),
    db.classSession.findMany({
      where: { ...where, date: { gte: from, lte: to } },
      include: displayInclude,
    }),
    db.holiday.findMany({ where: { date: { gte: from, lte: to } }, select: { date: true } }),
  ]);

  // Lookup tables for names (rows from both queries carry the same display includes).
  const courses = new Map([...slots, ...sessions].map((r) => [r.course.id, r.course]));
  const sections = new Map(
    [...slots, ...sessions].map((r) => [r.section.id, sectionLabel(r.section)]),
  );
  const faculty = new Map([...slots, ...sessions].map((r) => [r.faculty.id, r.faculty.user.name]));
  const rooms = new Map(
    [...slots, ...sessions].flatMap((r) => (r.room ? [[r.room.id, r.room.code] as const] : [])),
  );

  return expandOccurrences({
    slots,
    sessions,
    holidays: holidays.map((h) => h.date),
    from,
    to,
  }).map((o) => ({
    ...o,
    course: courses.get(o.courseId)!,
    section: sections.get(o.sectionId)!,
    room: o.roomId ? (rooms.get(o.roomId) ?? null) : null,
    faculty: faculty.get(o.facultyId)!,
  }));
}

// ── Faculty schedule changes ────────────────────────────────────────────────

export async function cancelClass(input: z.output<typeof cancelClassSchema>, user: CurrentUser) {
  const slot = await db.timetableSlot.findUnique({ where: { id: input.slotId } });
  if (!slot) throw notFound("Class not found");
  assertManagesFaculty(user, slot.facultyId);

  const { date } = input;
  if (date < today()) throw new HttpError(400, "past", "Past classes can't be cancelled.");
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
  if (existing && existing.attendanceState !== "NOT_TAKEN") {
    throw new HttpError(
      409,
      "attendance_taken",
      "Attendance has already been taken for this class.",
    );
  }
  const course = await db.course.findUniqueOrThrow({
    where: { id: slot.courseId },
    select: { code: true },
  });
  await notify(await enrolledUserIds(slot.sectionId, slot.courseId), {
    type: "SCHEDULE_CHANGE",
    title: `${course.code} on ${date.toISOString().slice(0, 10)} is cancelled`,
    body: input.reason,
    link: `/student/timetable?week=${date.toISOString().slice(0, 10)}`,
  });
  if (existing) {
    return db.classSession.update({
      where: { id: existing.id },
      data: { status: "CANCELLED", cancelReason: input.reason },
    });
  }
  return db.classSession.create({
    data: {
      timetableSlotId: slot.id,
      sectionId: slot.sectionId,
      courseId: slot.courseId,
      facultyId: slot.facultyId,
      roomId: slot.roomId,
      date,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
      status: "CANCELLED",
      cancelReason: input.reason,
    },
  });
}

/** Undo a cancellation (weekly class) or remove an extra class that hasn't happened yet. */
export async function restoreOrRemoveSession(sessionId: string, user: CurrentUser) {
  const session = await db.classSession.findUnique({ where: { id: sessionId } });
  if (!session) throw notFound("Class not found");
  assertManagesFaculty(user, session.facultyId);
  if (session.attendanceState !== "NOT_TAKEN") {
    throw new HttpError(
      409,
      "attendance_taken",
      "Attendance has already been taken for this class.",
    );
  }
  if (session.date < today()) throw new HttpError(400, "past", "Past classes can't be changed.");
  // Deleting the row restores a weekly class to its default (scheduled) state.
  await db.classSession.delete({ where: { id: sessionId } });
  const course = await db.course.findUniqueOrThrow({
    where: { id: session.courseId },
    select: { code: true },
  });
  const day = session.date.toISOString().slice(0, 10);
  await notify(await enrolledUserIds(session.sectionId, session.courseId), {
    type: "SCHEDULE_CHANGE",
    title: session.timetableSlotId
      ? `${course.code} on ${day} is back on`
      : `Extra ${course.code} class on ${day} is cancelled`,
    link: `/student/timetable?week=${day}`,
  });
}

export async function scheduleExtraClass(
  input: z.output<typeof extraClassSchema>,
  user: CurrentUser,
) {
  const assignment = await db.facultyAssignment.findUnique({
    where: { id: input.assignmentId },
    include: { section: { include: { semester: true } } },
  });
  if (!assignment) throw notFound("Course assignment not found");
  assertManagesFaculty(user, assignment.facultyId);

  const { date } = input;
  const { semester } = assignment.section;
  if (date < today())
    throw new HttpError(400, "past", "Extra classes must be scheduled for today or later.");
  if (date < semester.startDate || date > semester.endDate) {
    throw new HttpError(400, "outside_term", `The date must fall within ${semester.name}.`);
  }
  const holiday = await db.holiday.findFirst({ where: { date }, select: { name: true } });
  if (holiday) throw new HttpError(400, "holiday", `${holiday.name} is a holiday.`);

  const candidate: Booking = {
    sectionId: assignment.sectionId,
    facultyId: assignment.facultyId,
    roomId: input.roomId,
    startMinute: input.startMinute,
    endMinute: input.endMinute,
  };
  // Everything already happening that day for the same room, faculty or section.
  const resourceScopes: ScheduleScope[] = [
    { facultyId: candidate.facultyId },
    { sectionId: candidate.sectionId },
  ];
  const [byScope, roomSlots, roomSessions] = await Promise.all([
    Promise.all(resourceScopes.map((s) => getOccurrences(s, date, date))),
    db.timetableSlot.findMany({
      where: {
        roomId: input.roomId,
        dayOfWeek: isoWeekday(date),
        effectiveFrom: { lte: date },
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] }],
      },
      select: { sectionId: true },
    }),
    db.classSession.findMany({
      where: { roomId: input.roomId, date },
      select: { sectionId: true },
    }),
  ]);
  const roomSectionIds = [...new Set([...roomSlots, ...roomSessions].map((r) => r.sectionId))];
  const byRoom = await Promise.all(
    roomSectionIds.map((sectionId) => getOccurrences({ sectionId }, date, date)),
  );

  const sameDay = new Map(
    [...byScope.flat(), ...byRoom.flat()].filter((o) => !o.cancelled).map((o) => [o.key, o]),
  );
  const clashes = findBookingClashes(candidate, [...sameDay.values()]);
  if (clashes.length) {
    throw clashError(
      clashes.map((c) =>
        describeClash(c.resources, { ...c.with, courseCode: c.with.course.code }, "that day"),
      ),
    );
  }

  const created = await db.classSession.create({
    data: {
      sectionId: assignment.sectionId,
      courseId: assignment.courseId,
      facultyId: assignment.facultyId,
      roomId: input.roomId,
      date,
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      kind: "EXTRA",
    },
  });
  const course = await db.course.findUniqueOrThrow({
    where: { id: assignment.courseId },
    select: { code: true },
  });
  const day = date.toISOString().slice(0, 10);
  await notify(await enrolledUserIds(assignment.sectionId, assignment.courseId), {
    type: "SCHEDULE_CHANGE",
    title: `Extra ${course.code} class on ${day} at ${minutesToHHMM(input.startMinute)}`,
    link: `/student/timetable?week=${day}`,
  });
  return created;
}

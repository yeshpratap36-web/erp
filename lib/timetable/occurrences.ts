/**
 * Expands recurring weekly slots into dated class occurrences and merges in one-off
 * ClassSession rows (cancellations, extra classes, sessions with attendance).
 */
import { addDays, dateKey, eachDay, isoWeekday } from "@/lib/time";

export type SlotInput = {
  id: string;
  sectionId: string;
  courseId: string;
  facultyId: string;
  roomId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type SessionInput = {
  id: string;
  timetableSlotId: string | null;
  sectionId: string;
  courseId: string;
  facultyId: string;
  roomId: string | null;
  date: Date;
  startMinute: number;
  endMinute: number;
  kind: "REGULAR" | "EXTRA" | "RESCHEDULED";
  status: "SCHEDULED" | "CANCELLED" | "COMPLETED";
  cancelReason: string | null;
  attendanceState: "NOT_TAKEN" | "PROCESSING" | "PENDING_REVIEW" | "FINALIZED";
};

export type Occurrence = {
  /** Stable key: `${slotId}:${date}` for weekly classes, `session:${id}` for one-offs. */
  key: string;
  date: Date;
  startMinute: number;
  endMinute: number;
  sectionId: string;
  courseId: string;
  facultyId: string;
  roomId: string | null;
  slotId: string | null;
  sessionId: string | null;
  kind: "REGULAR" | "EXTRA" | "RESCHEDULED";
  cancelled: boolean;
  cancelReason: string | null;
  attendanceState: SessionInput["attendanceState"];
};

export function expandOccurrences({
  slots,
  sessions,
  holidays,
  from,
  to,
}: {
  slots: SlotInput[];
  sessions: SessionInput[];
  /** Calendar dates with no regular classes. */
  holidays: Date[];
  from: Date;
  to: Date;
}): Occurrence[] {
  const holidayKeys = new Set(holidays.map(dateKey));
  const sessionBySlotDate = new Map(
    sessions
      .filter((s) => s.timetableSlotId)
      .map((s) => [`${s.timetableSlotId}:${dateKey(s.date)}`, s]),
  );
  const out: Occurrence[] = [];

  for (const date of eachDay(from, to)) {
    const key = dateKey(date);
    const weekday = isoWeekday(date);
    if (holidayKeys.has(key)) continue;
    for (const slot of slots) {
      if (slot.dayOfWeek !== weekday) continue;
      if (date < slot.effectiveFrom || (slot.effectiveTo && date > slot.effectiveTo)) continue;
      const session = sessionBySlotDate.get(`${slot.id}:${key}`);
      out.push({
        key: `${slot.id}:${key}`,
        date,
        startMinute: session?.startMinute ?? slot.startMinute,
        endMinute: session?.endMinute ?? slot.endMinute,
        sectionId: slot.sectionId,
        courseId: slot.courseId,
        facultyId: slot.facultyId,
        roomId: session?.roomId ?? slot.roomId,
        slotId: slot.id,
        sessionId: session?.id ?? null,
        kind: "REGULAR",
        cancelled: session?.status === "CANCELLED",
        cancelReason: session?.cancelReason ?? null,
        attendanceState: session?.attendanceState ?? "NOT_TAKEN",
      });
    }
  }

  // One-off sessions not tied to a weekly slot (extra / rescheduled classes).
  for (const s of sessions) {
    if (s.timetableSlotId || s.date < from || s.date > to) continue;
    out.push({
      key: `session:${s.id}`,
      date: s.date,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      sectionId: s.sectionId,
      courseId: s.courseId,
      facultyId: s.facultyId,
      roomId: s.roomId,
      slotId: null,
      sessionId: s.id,
      kind: s.kind,
      cancelled: s.status === "CANCELLED",
      cancelReason: s.cancelReason,
      attendanceState: s.attendanceState,
    });
  }

  return out.sort((a, b) => a.date.getTime() - b.date.getTime() || a.startMinute - b.startMinute);
}

/** The week (Mon–Sun) containing `date`. */
export const weekRange = (monday: Date) => ({ from: monday, to: addDays(monday, 6) });

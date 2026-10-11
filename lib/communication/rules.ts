/**
 * Pure rules for announcements and requests (unit-tested; used by the services).
 */
import type { AnnouncementAudience, Role } from "@/generated/prisma/enums";

export type Viewer = {
  role: Role;
  departmentId: string | null;
  /** Students: their home section. Faculty: sections they teach. */
  sectionIds: string[];
};

export type AnnouncementTarget = {
  audience: AnnouncementAudience;
  targetRole: Role | null;
  departmentId: string | null;
  sectionId: string | null;
  publishedAt: Date;
  expiresAt: Date | null;
};

/** Is an announcement currently visible to this viewer? Admins see everything that's live. */
export function isVisibleTo(a: AnnouncementTarget, viewer: Viewer, now: Date): boolean {
  if (a.publishedAt > now || (a.expiresAt && a.expiresAt <= now)) return false;
  if (viewer.role === "SUPER_ADMIN") return true;
  switch (a.audience) {
    case "ALL":
      return true;
    case "ROLE":
      return a.targetRole === viewer.role;
    case "DEPARTMENT":
      return a.departmentId !== null && a.departmentId === viewer.departmentId;
    case "SECTION":
      return a.sectionId !== null && viewer.sectionIds.includes(a.sectionId);
  }
}

/** Inclusive calendar-date ranges overlap. */
export const dateRangesOverlap = (aFrom: Date, aTo: Date, bFrom: Date, bTo: Date) =>
  aFrom <= bTo && bFrom <= aTo;

export const MAX_LEAVE_DAYS = 30;
/** Leave may start up to this many days in the past (e.g. sick leave reported on return). */
export const LEAVE_BACKDATE_DAYS = 7;
/** Corrections can be requested for classes up to this many days old. */
export const CORRECTION_WINDOW_DAYS = 30;

const DAY = 86_400_000;
export const daysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / DAY);

/** Problems with a leave request's dates, or [] if valid. */
export function leaveDateProblems(from: Date, to: Date, today: Date): string[] {
  const problems: string[] = [];
  if (to < from) problems.push("The end date must be on or after the start date");
  if (daysBetween(from, to) + 1 > MAX_LEAVE_DAYS)
    problems.push(`Leave can be at most ${MAX_LEAVE_DAYS} days`);
  if (daysBetween(from, today) > LEAVE_BACKDATE_DAYS) {
    problems.push(`Leave can start at most ${LEAVE_BACKDATE_DAYS} days ago`);
  }
  return problems;
}

/** Can the student ask to change this record to `requested`? Returns a reason when not. */
export function correctionProblem(
  record: {
    status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
    sessionDate: Date;
    finalized: boolean;
  },
  requested: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED",
  today: Date,
): string | null {
  if (!record.finalized) return "Attendance for this class hasn't been confirmed yet";
  if (record.status === requested) return "That's already the recorded status";
  if (requested === "ABSENT") return "You can't request to be marked absent";
  if (daysBetween(record.sessionDate, today) > CORRECTION_WINDOW_DAYS) {
    return `Corrections can be requested within ${CORRECTION_WINDOW_DAYS} days of the class`;
  }
  return null;
}

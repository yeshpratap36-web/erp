import "server-only";
import {
  addTallies,
  classesCanMiss,
  classesNeeded,
  percentage,
  tally,
  type AttendanceTally,
} from "@/lib/attendance/stats";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings.server";

/** Only attendance a faculty member has confirmed counts. */
const countedSession = { attendanceState: "FINALIZED", status: { not: "CANCELLED" } } as const;

export type AttendanceSummary = AttendanceTally & {
  percent: number | null;
  needed: number;
  canMiss: number;
  belowThreshold: boolean;
};

function summarize(t: AttendanceTally, threshold: number): AttendanceSummary {
  const percent = percentage(t);
  return {
    ...t,
    percent,
    needed: classesNeeded(t, threshold),
    canMiss: classesCanMiss(t, threshold),
    belowThreshold: percent !== null && percent < threshold,
  };
}

/** Per-course and overall attendance for one student (callers must pass their own id). */
export async function studentAttendance(studentId: string) {
  const [threshold, enrollments, records] = await Promise.all([
    getSetting("attendance.threshold"),
    db.enrollment.findMany({
      where: { studentId },
      select: { courseId: true, course: { select: { code: true, name: true, credits: true } } },
      orderBy: { course: { code: "asc" } },
    }),
    db.attendanceRecord.findMany({
      where: { studentId, session: countedSession },
      select: { status: true, session: { select: { courseId: true } } },
    }),
  ]);

  const byCourse = new Map<string, (typeof records)[number]["status"][]>();
  for (const r of records) {
    const list = byCourse.get(r.session.courseId) ?? [];
    list.push(r.status);
    byCourse.set(r.session.courseId, list);
  }

  // Unique courses (a student can be enrolled in the same course via two sections only by mistake).
  const courses = [...new Map(enrollments.map((e) => [e.courseId, e])).values()].map((e) => ({
    courseId: e.courseId,
    ...e.course,
    ...summarize(tally(byCourse.get(e.courseId) ?? []), threshold),
  }));
  const overall = summarize(addTallies(courses), threshold);
  return { threshold, overall, courses };
}

/** Day-wise attendance log for one student, newest first. */
export async function studentAttendanceLog(
  studentId: string,
  { skip, take }: { skip: number; take: number },
) {
  const where = { studentId, session: countedSession };
  const [rows, total] = await Promise.all([
    db.attendanceRecord.findMany({
      where,
      orderBy: [{ session: { date: "desc" } }, { session: { startMinute: "desc" } }],
      skip,
      take,
      select: {
        id: true,
        status: true,
        method: true,
        session: {
          select: { date: true, startMinute: true, course: { select: { code: true, name: true } } },
        },
      },
    }),
    db.attendanceRecord.count({ where }),
  ]);
  return { rows, total };
}

/** Roster of a section's course with each student's attendance (callers must check access). */
export async function sectionCourseRoster(sectionId: string, courseId: string) {
  const [threshold, enrollments, records, held] = await Promise.all([
    getSetting("attendance.threshold"),
    db.enrollment.findMany({
      where: { sectionId, courseId, student: { deletedAt: null } },
      orderBy: { student: { rollNumber: "asc" } },
      select: {
        student: {
          select: {
            id: true,
            rollNumber: true,
            faceEnrolledAt: true,
            faceReenrollAllowed: true,
            user: { select: { name: true, isActive: true } },
          },
        },
      },
    }),
    db.attendanceRecord.findMany({
      where: { session: { sectionId, courseId, ...countedSession } },
      select: { studentId: true, status: true },
    }),
    db.classSession.count({ where: { sectionId, courseId, ...countedSession } }),
  ]);

  const byStudent = new Map<string, (typeof records)[number]["status"][]>();
  for (const r of records) {
    const list = byStudent.get(r.studentId) ?? [];
    list.push(r.status);
    byStudent.set(r.studentId, list);
  }

  const students = enrollments.map(({ student }) => ({
    id: student.id,
    rollNumber: student.rollNumber,
    name: student.user.name,
    isActive: student.user.isActive,
    faceEnrolled: student.faceEnrolledAt !== null,
    faceReenrollAllowed: student.faceReenrollAllowed,
    ...summarize(tally(byStudent.get(student.id) ?? []), threshold),
  }));
  return { threshold, held, students };
}

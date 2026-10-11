import "server-only";
import { courseProgress, gradeFor } from "@/lib/academics/grading";
import { percentage } from "@/lib/attendance/stats";
import { db } from "@/lib/db";
import { defaultGradeBands } from "@/lib/services/exams";
import { getSetting } from "@/lib/settings.server";

/** Institution-wide analytics for one term. Admin-only (callers enforce analytics:read:any). */

type Tally = { attended: number; total: number };

/** Attendance tallies per student for a term (finalized, non-cancelled sessions only). */
async function attendanceByStudent(semesterId: string) {
  const rows = await db.$queryRaw<{ studentId: string; attended: bigint; total: bigint }[]>`
    SELECT r."studentId",
           count(*) FILTER (WHERE r."status" IN ('PRESENT', 'LATE')) AS "attended",
           count(*) FILTER (WHERE r."status" <> 'EXCUSED')         AS "total"
    FROM "AttendanceRecord" r
    JOIN "ClassSession" s ON s."id" = r."sessionId"
    JOIN "Section" sec ON sec."id" = s."sectionId"
    WHERE sec."semesterId" = ${semesterId}
      AND s."attendanceState" = 'FINALIZED' AND s."status" <> 'CANCELLED'
    GROUP BY r."studentId"`;
  return new Map<string, Tally>(
    rows.map((r) => [r.studentId, { attended: Number(r.attended), total: Number(r.total) }]),
  );
}

/** Running course percentage per (student, course) from all entered marks this term. */
async function coursePercents(semesterId: string) {
  const exams = await db.exam.findMany({
    where: { semesterId },
    select: {
      id: true,
      courseId: true,
      maxMarks: true,
      weightage: true,
      course: { select: { code: true, departmentId: true } },
      marks: { select: { studentId: true, marksObtained: true, isAbsent: true } },
    },
  });
  const byStudentCourse = new Map<
    string,
    {
      studentId: string;
      courseId: string;
      code: string;
      departmentId: string;
      marks: { examId: string; marksObtained: number | null; isAbsent: boolean }[];
    }
  >();
  const examsByCourse = new Map<string, typeof exams>();
  for (const e of exams) {
    examsByCourse.set(e.courseId, [...(examsByCourse.get(e.courseId) ?? []), e]);
    for (const m of e.marks) {
      const key = `${m.studentId}:${e.courseId}`;
      const entry = byStudentCourse.get(key) ?? {
        studentId: m.studentId,
        courseId: e.courseId,
        code: e.course.code,
        departmentId: e.course.departmentId,
        marks: [],
      };
      entry.marks.push({ examId: e.id, marksObtained: m.marksObtained, isAbsent: m.isAbsent });
      byStudentCourse.set(key, entry);
    }
  }
  return [...byStudentCourse.values()].flatMap((sc) => {
    const p = courseProgress(examsByCourse.get(sc.courseId)!, sc.marks);
    return p.percent === null ? [] : [{ ...sc, percent: p.percent }];
  });
}

export async function termAnalytics(semesterId: string) {
  const [threshold, bands, attendance, percents, students, departments, weekly, deptAttendance] =
    await Promise.all([
      getSetting("attendance.threshold"),
      defaultGradeBands(),
      attendanceByStudent(semesterId),
      coursePercents(semesterId),
      db.studentProfile.findMany({
        where: { deletedAt: null, user: { isActive: true }, section: { semesterId } },
        select: {
          id: true,
          userId: true,
          rollNumber: true,
          user: { select: { name: true } },
          section: {
            select: {
              name: true,
              semesterNo: true,
              program: { select: { code: true, departmentId: true } },
            },
          },
        },
        orderBy: { rollNumber: "asc" },
      }),
      db.department.findMany({
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      db.$queryRaw<{ week: Date; attended: bigint; total: bigint }[]>`
      SELECT date_trunc('week', s."date")::date AS "week",
             count(*) FILTER (WHERE r."status" IN ('PRESENT', 'LATE')) AS "attended",
             count(*) FILTER (WHERE r."status" <> 'EXCUSED')         AS "total"
      FROM "AttendanceRecord" r
      JOIN "ClassSession" s ON s."id" = r."sessionId"
      JOIN "Section" sec ON sec."id" = s."sectionId"
      WHERE sec."semesterId" = ${semesterId}
        AND s."attendanceState" = 'FINALIZED' AND s."status" <> 'CANCELLED'
      GROUP BY 1 ORDER BY 1`,
      db.$queryRaw<{ departmentId: string; attended: bigint; total: bigint }[]>`
      SELECT c."departmentId",
             count(*) FILTER (WHERE r."status" IN ('PRESENT', 'LATE')) AS "attended",
             count(*) FILTER (WHERE r."status" <> 'EXCUSED')         AS "total"
      FROM "AttendanceRecord" r
      JOIN "ClassSession" s ON s."id" = r."sessionId"
      JOIN "Course" c ON c."id" = s."courseId"
      JOIN "Section" sec ON sec."id" = s."sectionId"
      WHERE sec."semesterId" = ${semesterId}
        AND s."attendanceState" = 'FINALIZED' AND s."status" <> 'CANCELLED'
      GROUP BY 1`,
    ]);

  const passMark = Math.min(...bands.filter((b) => b.isPass).map((b) => b.minPercent));
  const toTally = (r: { attended: bigint; total: bigint }): Tally => ({
    attended: Number(r.attended),
    total: Number(r.total),
  });

  // ── At-risk students ──
  const failingByStudent = new Map<string, { code: string; percent: number }[]>();
  for (const p of percents) {
    if (p.percent < passMark) {
      failingByStudent.set(p.studentId, [
        ...(failingByStudent.get(p.studentId) ?? []),
        { code: p.code, percent: p.percent },
      ]);
    }
  }
  const atRisk = students
    .map((s) => {
      const t = attendance.get(s.id) ?? { attended: 0, total: 0 };
      const attendancePercent = percentage(t);
      const lowAttendance = attendancePercent !== null && attendancePercent < threshold;
      const failing = failingByStudent.get(s.id) ?? [];
      return {
        id: s.id,
        userId: s.userId,
        rollNumber: s.rollNumber,
        name: s.user.name,
        section: s.section
          ? `${s.section.program.code} ${s.section.semesterNo}${s.section.name}`
          : "—",
        attendancePercent,
        lowAttendance,
        failing,
        level:
          lowAttendance && failing.length
            ? ("high" as const)
            : lowAttendance || failing.length
              ? ("medium" as const)
              : null,
      };
    })
    .filter((s) => s.level !== null)
    .sort((a, b) =>
      a.level === b.level
        ? (a.attendancePercent ?? 100) - (b.attendancePercent ?? 100)
        : a.level === "high"
          ? -1
          : 1,
    );

  // ── Department comparison ──
  const deptAtt = new Map(deptAttendance.map((d) => [d.departmentId, toTally(d)]));
  const deptMarks = new Map<string, number[]>();
  for (const p of percents)
    deptMarks.set(p.departmentId, [...(deptMarks.get(p.departmentId) ?? []), p.percent]);
  const departmentRows = departments.map((d) => {
    const marks = deptMarks.get(d.id) ?? [];
    return {
      code: d.code,
      name: d.name,
      attendancePercent: deptAtt.has(d.id) ? percentage(deptAtt.get(d.id)!) : null,
      averageMarks: marks.length
        ? Math.round((marks.reduce((s, v) => s + v, 0) / marks.length) * 10) / 10
        : null,
    };
  });

  const overall = [...attendance.values()].reduce(
    (a, t) => ({ attended: a.attended + t.attended, total: a.total + t.total }),
    { attended: 0, total: 0 },
  );
  const allPercents = percents.map((p) => p.percent);
  return {
    threshold,
    passMark,
    overview: {
      students: students.length,
      attendancePercent: percentage(overall),
      belowThreshold: atRisk.filter((s) => s.lowAttendance).length,
      atRiskHigh: atRisk.filter((s) => s.level === "high").length,
      atRisk: atRisk.length,
      averageMarks: allPercents.length
        ? Math.round((allPercents.reduce((s, v) => s + v, 0) / allPercents.length) * 10) / 10
        : null,
      averageGrade: allPercents.length
        ? gradeFor(allPercents.reduce((s, v) => s + v, 0) / allPercents.length, bands).letter
        : null,
    },
    weekly: weekly.map((w) => ({
      week: w.week,
      percent: percentage(toTally(w)) ?? 0,
      total: Number(w.total),
    })),
    departments: departmentRows,
    atRisk,
  };
}

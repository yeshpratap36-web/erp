/**
 * Development-only demo data, safe to run on an existing dev database (`pnpm db:demo`):
 *  1. Marks the first DEMO_ONBOARDED_PER_SECTION students of each current section as fully
 *     onboarded (password = SEED_DEFAULT_PASSWORD, no forced change, face step skipped) so
 *     the student dashboard can be used before face enrollment exists.
 *  2. Creates finalized class sessions with attendance for every past class this term that
 *     has none yet. A couple of students are deliberately below the 75% threshold.
 * Idempotent: re-running only fills in days that are still missing.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { APP_TIMEZONE } from "@/lib/config";
import { expandOccurrences } from "@/lib/timetable/occurrences";
import { gradeFor } from "@/lib/academics/grading";
import { addDays, nowIn } from "@/lib/time";

const PER_SECTION = Number(process.env.DEMO_ONBOARDED_PER_SECTION ?? 3);
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe@123";

/** Small deterministic PRNG (mulberry32) so demo data is the same on every machine. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("db:demo must never run in production");

  const term = await db.semester.findFirst({ where: { isCurrent: true } });
  if (!term) throw new Error("No current term — run the seed first.");
  const sections = await db.section.findMany({
    where: { semesterId: term.id },
    orderBy: { name: "asc" },
  });

  // ── 1. Onboarded demo students ───────────────────────────────────────────
  const passwordHash = await hashPassword(PASSWORD);
  const onboarded: string[] = [];
  for (const section of sections) {
    const students = await db.studentProfile.findMany({
      where: { sectionId: section.id, deletedAt: null },
      orderBy: { rollNumber: "asc" },
      take: PER_SECTION,
      select: { userId: true, rollNumber: true },
    });
    for (const s of students) {
      await db.user.update({
        where: { id: s.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          onboardingStep: "COMPLETE",
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
          sessionVersion: { increment: 1 },
        },
      });
      onboarded.push(s.rollNumber);
    }
  }

  // ── 2. Past sessions + attendance ────────────────────────────────────────
  const yesterday = addDays(nowIn(APP_TIMEZONE).date, -1);
  const to = yesterday < term.endDate ? yesterday : term.endDate;
  let createdSessions = 0;
  let createdRecords = 0;

  if (to >= term.startDate) {
    const [slots, existing, holidays, faculty] = await Promise.all([
      db.timetableSlot.findMany({ where: { sectionId: { in: sections.map((s) => s.id) } } }),
      db.classSession.findMany({
        where: { sectionId: { in: sections.map((s) => s.id) }, date: { lte: to } },
      }),
      db.holiday.findMany({
        where: { date: { gte: term.startDate, lte: to } },
        select: { date: true },
      }),
      db.facultyProfile.findMany({ select: { id: true, userId: true } }),
    ]);
    const facultyUser = new Map(faculty.map((f) => [f.id, f.userId]));

    const pending = expandOccurrences({
      slots,
      sessions: existing,
      holidays: holidays.map((h) => h.date),
      from: term.startDate,
      to,
    }).filter((o) => o.slotId && !o.sessionId);

    const enrollments = await db.enrollment.findMany({
      where: { sectionId: { in: sections.map((s) => s.id) } },
      orderBy: { student: { rollNumber: "asc" } },
      select: { sectionId: true, courseId: true, studentId: true },
    });
    const allStudents = [...new Set(enrollments.map((e) => e.studentId))];
    // Every 7th student (2nd, 9th, …) attends ~62% of classes; everyone else ~88–96%.
    const propensity = new Map(
      allStudents.map((id, i) => [id, i % 7 === 1 ? 0.62 : 0.88 + (i % 5) * 0.02]),
    );
    const random = rng(42);

    for (const occ of pending) {
      const cancelled = random() < 0.03;
      const facultyUserId = facultyUser.get(occ.facultyId)!;
      const session = await db.classSession.create({
        data: {
          timetableSlotId: occ.slotId,
          sectionId: occ.sectionId,
          courseId: occ.courseId,
          facultyId: occ.facultyId,
          roomId: occ.roomId,
          date: occ.date,
          startMinute: occ.startMinute,
          endMinute: occ.endMinute,
          ...(cancelled
            ? { status: "CANCELLED" as const, cancelReason: "Faculty on leave" }
            : {
                status: "COMPLETED" as const,
                attendanceState: "FINALIZED" as const,
                finalizedById: facultyUserId,
                finalizedAt: occ.date,
              }),
        },
      });
      createdSessions++;
      if (cancelled) continue;

      const roster = enrollments.filter(
        (e) => e.sectionId === occ.sectionId && e.courseId === occ.courseId,
      );
      const result = await db.attendanceRecord.createMany({
        data: roster.map((e) => {
          const r = random();
          const p = propensity.get(e.studentId)!;
          const status =
            r < p ? (r < p - 0.04 ? "PRESENT" : "LATE") : r > 0.985 ? "EXCUSED" : "ABSENT";
          return {
            sessionId: session.id,
            studentId: e.studentId,
            status,
            method: "MANUAL" as const,
            markedById: facultyUserId,
            confirmedById: facultyUserId,
            confirmedAt: occ.date,
          };
        }),
      });
      createdRecords += result.count;
    }
  }

  // ── 3. Exams & marks this term, 4. past-term results ─────────────────────
  const { exams: createdExams, results: createdResults } = await demoAcademics(
    term,
    sections.map((s) => s.id),
  );

  console.log(`
Demo data ready.
  Onboarded students (password ${PASSWORD}): ${onboarded.join(", ")}
  New past sessions: ${createdSessions}   New attendance records: ${createdRecords}
  New exams: ${createdExams}   New past course results: ${createdResults}
`);
}

/** Ability 0–1 per student, tied to the same pattern as demo attendance (every 7th struggles). */
function abilityOf(index: number, random: () => number) {
  const base = index % 7 === 1 ? 0.38 : 0.6 + (index % 5) * 0.07;
  return Math.min(0.98, Math.max(0.1, base + (random() - 0.5) * 0.12));
}

async function demoAcademics(term: { id: string; startDate: Date }, sectionIds: string[]) {
  const random = rng(7);
  const bands = (
    await db.gradeScale.findFirstOrThrow({ where: { isDefault: true }, include: { bands: true } })
  ).bands;
  const facultyUsers = new Map(
    (await db.facultyProfile.findMany({ select: { id: true, userId: true } })).map((f) => [
      f.id,
      f.userId,
    ]),
  );
  const students = await db.studentProfile.findMany({
    where: { sectionId: { in: sectionIds }, deletedAt: null },
    orderBy: { rollNumber: "asc" },
    select: { id: true },
  });
  const ability = new Map(students.map((s, i) => [s.id, abilityOf(i, random)]));

  // Current term: one set of assessments per (section, course).
  const plan = [
    {
      name: "Quiz 1",
      type: "QUIZ" as const,
      maxMarks: 20,
      weightage: 10,
      week: 3,
      published: true,
    },
    {
      name: "Assignment 1",
      type: "ASSIGNMENT" as const,
      maxMarks: 10,
      weightage: 10,
      week: 5,
      published: true,
    },
    {
      name: "Midterm",
      type: "MIDTERM" as const,
      maxMarks: 50,
      weightage: 30,
      week: 8,
      published: true,
    },
    {
      name: "End-term",
      type: "ENDTERM" as const,
      maxMarks: 100,
      weightage: 50,
      week: 20,
      published: false,
    },
  ];
  let exams = 0;
  const offerings = await db.facultyAssignment.findMany({
    where: { sectionId: { in: sectionIds } },
    distinct: ["sectionId", "courseId"],
    select: { sectionId: true, courseId: true, facultyId: true },
  });
  for (const o of offerings) {
    if (
      await db.exam.count({
        where: { sectionId: o.sectionId, courseId: o.courseId, semesterId: term.id },
      })
    )
      continue;
    const roster = await db.enrollment.findMany({
      where: { sectionId: o.sectionId, courseId: o.courseId },
      select: { studentId: true },
    });
    for (const p of plan) {
      const exam = await db.exam.create({
        data: {
          name: p.name,
          type: p.type,
          courseId: o.courseId,
          sectionId: o.sectionId,
          semesterId: term.id,
          maxMarks: p.maxMarks,
          weightage: p.weightage,
          date: addDays(term.startDate, p.week * 7),
          isPublished: p.published,
        },
      });
      exams++;
      if (!p.published) continue; // end-term not held yet
      await db.mark.createMany({
        data: roster.map(({ studentId }) => {
          const absent = random() < 0.03;
          const score = Math.min(
            1,
            Math.max(0, (ability.get(studentId) ?? 0.6) + (random() - 0.5) * 0.2),
          );
          return {
            examId: exam.id,
            studentId,
            isAbsent: absent,
            marksObtained: absent ? null : Math.round(score * p.maxMarks * 2) / 2,
            enteredById: facultyUsers.get(o.facultyId)!,
          };
        }),
      });
    }
  }

  // Past year: two terms of published results so SGPA history and CGPA have data.
  const dept = await db.department.findFirstOrThrow({ where: { code: "CSE" } });
  const pastYear =
    (await db.academicYear.findUnique({ where: { name: "2025-26" } })) ??
    (await db.academicYear.create({
      data: { name: "2025-26", startDate: new Date("2025-07-01"), endDate: new Date("2026-06-30") },
    }));
  const pastTerms = [
    {
      term: "ODD" as const,
      name: "Odd Semester 2025-26",
      start: "2025-07-15",
      end: "2025-12-15",
      semesterNo: 1,
    },
    {
      term: "EVEN" as const,
      name: "Even Semester 2025-26",
      start: "2026-01-05",
      end: "2026-05-31",
      semesterNo: 2,
    },
  ];
  const pastCourses: Record<number, { code: string; name: string; credits: number }[]> = {
    1: [
      { code: "CS101", name: "Programming Fundamentals", credits: 4 },
      { code: "MA101", name: "Engineering Mathematics I", credits: 4 },
      { code: "PH101", name: "Engineering Physics", credits: 3 },
      { code: "HS101", name: "Communication Skills", credits: 2 },
    ],
    2: [
      { code: "CS201", name: "Object-Oriented Programming", credits: 4 },
      { code: "MA201", name: "Engineering Mathematics II", credits: 4 },
      { code: "EC201", name: "Digital Logic", credits: 3 },
      { code: "CS202", name: "Programming Lab", credits: 2 },
    ],
  };
  let results = 0;
  for (const t of pastTerms) {
    const semester =
      (await db.semester.findUnique({
        where: { academicYearId_term: { academicYearId: pastYear.id, term: t.term } },
      })) ??
      (await db.semester.create({
        data: {
          academicYearId: pastYear.id,
          name: t.name,
          term: t.term,
          startDate: new Date(t.start),
          endDate: new Date(t.end),
        },
      }));
    for (const c of pastCourses[t.semesterNo]) {
      const course =
        (await db.course.findUnique({ where: { code: c.code } })) ??
        (await db.course.create({
          data: { ...c, departmentId: dept.id, semesterNo: t.semesterNo },
        }));
      const res = await db.courseResult.createMany({
        skipDuplicates: true,
        data: students.map((s) => {
          const percent =
            Math.round(
              Math.min(
                100,
                Math.max(15, ((ability.get(s.id) ?? 0.6) + (random() - 0.5) * 0.25) * 100),
              ) * 100,
            ) / 100;
          const band = gradeFor(percent, bands);
          return {
            studentId: s.id,
            courseId: course.id,
            semesterId: semester.id,
            totalPercent: percent,
            gradeLetter: band.letter,
            gradePoint: band.gradePoint,
            credits: course.credits,
            isPublished: true,
          };
        }),
      });
      results += res.count;
    }
  }
  return { exams, results };
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

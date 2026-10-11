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

  console.log(`
Demo data ready.
  Onboarded students (password ${PASSWORD}): ${onboarded.join(", ")}
  New past sessions: ${createdSessions}   New attendance records: ${createdRecords}
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

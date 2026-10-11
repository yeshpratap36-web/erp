/**
 * Development seed: 1 admin, 2 faculty, 20 students, one program with two sections,
 * five courses, rooms, a clash-free weekly timetable, grade scale, settings and holidays.
 *
 * Run with `pnpm db:seed` (or automatically via `pnpm db:reset`).
 * Refuses to run against a database that already has users.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { academicYearFor } from "@/lib/academics/calendar";
import { hashPassword } from "@/lib/auth/password";
import { settingDefaults } from "@/lib/settings";
import type { CourseType, SessionType } from "@/generated/prisma/client";

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe@123";
const EMAIL_DOMAIN = "college.edu";

const STUDENT_NAMES = [
  "Aarav Sharma",
  "Diya Patel",
  "Vihaan Reddy",
  "Ananya Iyer",
  "Arjun Nair",
  "Ishita Gupta",
  "Kabir Singh",
  "Meera Joshi",
  "Rohan Das",
  "Saanvi Kulkarni",
  "Aditya Verma",
  "Kavya Menon",
  "Dev Malhotra",
  "Riya Choudhary",
  "Krish Bhat",
  "Nisha Pillai",
  "Yash Agarwal",
  "Tanvi Rao",
  "Siddharth Jain",
  "Pooja Hegde",
];

const COURSES: {
  code: string;
  name: string;
  credits: number;
  type: CourseType;
  weeklyHours: number;
}[] = [
  { code: "CS301", name: "Data Structures", credits: 4, type: "THEORY", weeklyHours: 3 },
  {
    code: "CS302",
    name: "Database Management Systems",
    credits: 4,
    type: "THEORY",
    weeklyHours: 3,
  },
  { code: "CS303", name: "Operating Systems", credits: 3, type: "THEORY", weeklyHours: 3 },
  { code: "CS304", name: "Discrete Mathematics", credits: 3, type: "THEORY", weeklyHours: 3 },
  { code: "CS305", name: "Data Structures Lab", credits: 2, type: "LAB", weeklyHours: 1 },
];

/** Course code → faculty employee ID. */
const TEACHES: Record<string, string> = {
  CS301: "FAC001",
  CS303: "FAC001",
  CS305: "FAC001",
  CS302: "FAC002",
  CS304: "FAC002",
};

const hm = (h: number, m = 0) => h * 60 + m;
const LECTURE_PERIODS = [
  [hm(9), hm(10)],
  [hm(10), hm(11)],
  [hm(11, 15), hm(12, 15)],
  [hm(13, 15), hm(14, 15)],
] as const;
const LAB_PERIOD = [hm(14, 30), hm(16, 30)] as const;
const WEEKDAYS = [1, 2, 3, 4, 5];

async function main() {
  if ((await db.user.count()) > 0) {
    console.log("Database already has users — skipping seed. Run `pnpm db:reset` to start over.");
    return;
  }

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  // ── Settings & grading ────────────────────────────────────────────────────
  await db.setting.createMany({
    data: Object.entries(settingDefaults).map(([key, value]) => ({ key, value })),
  });

  await db.gradeScale.create({
    data: {
      name: "10-point (default)",
      isDefault: true,
      bands: {
        create: [
          { letter: "O", minPercent: 90, gradePoint: 10 },
          { letter: "A+", minPercent: 80, gradePoint: 9 },
          { letter: "A", minPercent: 70, gradePoint: 8 },
          { letter: "B+", minPercent: 60, gradePoint: 7 },
          { letter: "B", minPercent: 50, gradePoint: 6 },
          { letter: "C", minPercent: 45, gradePoint: 5 },
          { letter: "P", minPercent: 40, gradePoint: 4 },
          { letter: "F", minPercent: 0, gradePoint: 0, isPass: false },
        ],
      },
    },
  });

  // ── Academic calendar (relative to today, so the current term always contains today) ──
  const cal = academicYearFor(new Date());
  const year = await db.academicYear.create({
    data: {
      name: cal.name,
      startDate: cal.startDate,
      endDate: cal.endDate,
      isCurrent: true,
      holidays: { create: cal.holidays },
    },
  });
  const [odd, even] = await Promise.all(
    [cal.odd, cal.even].map((t) =>
      db.semester.create({
        data: { academicYearId: year.id, ...t, isCurrent: t.term === cal.currentTerm },
      }),
    ),
  );
  const semester = cal.currentTerm === "ODD" ? odd : even;

  // ── Structure ─────────────────────────────────────────────────────────────
  const dept = await db.department.create({
    data: { code: "CSE", name: "Computer Science & Engineering" },
  });
  const program = await db.program.create({
    data: {
      code: "BTECH-CSE",
      name: "B.Tech Computer Science",
      degree: "B.Tech",
      departmentId: dept.id,
    },
  });

  const courses = await Promise.all(
    COURSES.map(({ weeklyHours: _, ...c }) =>
      db.course.create({ data: { ...c, departmentId: dept.id, semesterNo: 3 } }),
    ),
  );

  const [lh101, lh102, lab1] = await Promise.all([
    db.room.create({
      data: { code: "LH-101", name: "Lecture Hall 101", building: "Main Block", capacity: 60 },
    }),
    db.room.create({
      data: { code: "LH-102", name: "Lecture Hall 102", building: "Main Block", capacity: 60 },
    }),
    db.room.create({
      data: {
        code: "LAB-1",
        name: "Computing Lab 1",
        building: "Tech Block",
        capacity: 40,
        type: "LAB",
      },
    }),
  ]);

  const sections = await Promise.all(
    ["A", "B"].map((name) =>
      db.section.create({
        data: { name, programId: program.id, semesterId: semester.id, semesterNo: 3 },
      }),
    ),
  );
  const homeRoom = { [sections[0].id]: lh101.id, [sections[1].id]: lh102.id };

  // ── People ────────────────────────────────────────────────────────────────
  await db.user.create({
    data: {
      loginId: "admin",
      email: `admin@${EMAIL_DOMAIN}`,
      name: "System Administrator",
      role: "SUPER_ADMIN",
      passwordHash,
    },
  });

  const facultyData = [
    { employeeId: "FAC001", name: "Dr. Anita Rao", designation: "Associate Professor" },
    { employeeId: "FAC002", name: "Prof. Rahul Mehta", designation: "Assistant Professor" },
  ];
  const faculty = await Promise.all(
    facultyData.map((f) =>
      db.facultyProfile.create({
        data: {
          employeeId: f.employeeId,
          designation: f.designation,
          department: { connect: { id: dept.id } },
          user: {
            create: {
              loginId: f.employeeId,
              email: `${f.employeeId.toLowerCase()}@${EMAIL_DOMAIN}`,
              name: f.name,
              role: "FACULTY",
              passwordHash,
            },
          },
        },
      }),
    ),
  );
  const facultyByEmpId = Object.fromEntries(faculty.map((f) => [f.employeeId, f]));

  const students = [];
  for (const [i, name] of STUDENT_NAMES.entries()) {
    const rollNumber = `26CSE${String(i + 1).padStart(3, "0")}`;
    const section = sections[i < 10 ? 0 : 1];
    students.push(
      await db.studentProfile.create({
        data: {
          rollNumber,
          admissionYear: 2025,
          currentSemesterNo: 3,
          program: { connect: { id: program.id } },
          section: { connect: { id: section.id } },
          user: {
            create: {
              loginId: rollNumber,
              email: `${rollNumber.toLowerCase()}@${EMAIL_DOMAIN}`,
              name,
              role: "STUDENT",
              passwordHash,
            },
          },
        },
      }),
    );
  }

  // ── Enrollment & faculty assignments ──────────────────────────────────────
  await db.enrollment.createMany({
    data: students.flatMap((s) =>
      courses.map((c) => ({ studentId: s.id, sectionId: s.sectionId!, courseId: c.id })),
    ),
  });
  await db.facultyAssignment.createMany({
    data: sections.flatMap((sec) =>
      courses.map((c) => ({
        sectionId: sec.id,
        courseId: c.id,
        facultyId: facultyByEmpId[TEACHES[c.code]].id,
      })),
    ),
  });

  // ── Timetable (greedy, clash-free on section / faculty / room) ────────────
  type Slot = {
    sectionId: string;
    courseId: string;
    facultyId: string;
    roomId: string;
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
    type: SessionType;
  };
  const slots: Slot[] = [];
  const overlaps = (a: Slot, b: Omit<Slot, "courseId" | "type">) =>
    a.dayOfWeek === b.dayOfWeek && a.startMinute < b.endMinute && b.startMinute < a.endMinute;
  const isFree = (c: Omit<Slot, "courseId" | "type">) =>
    !slots.some(
      (s) =>
        overlaps(s, c) &&
        (s.sectionId === c.sectionId || s.facultyId === c.facultyId || s.roomId === c.roomId),
    );

  for (const [secIdx, section] of sections.entries()) {
    for (const [courseIdx, course] of courses.entries()) {
      const spec = COURSES[courseIdx];
      const facultyId = facultyByEmpId[TEACHES[spec.code]].id;
      const isLab = spec.type === "LAB";
      const periods = isLab ? [LAB_PERIOD] : LECTURE_PERIODS;
      const roomId = isLab ? lab1.id : homeRoom[section.id];
      // Rotate the starting day per course/section so lectures spread across the week.
      const days = WEEKDAYS.map((_, k) => WEEKDAYS[(k + courseIdx + secIdx) % WEEKDAYS.length]);

      let placed = 0;
      for (const dayOfWeek of days) {
        if (placed === spec.weeklyHours) break;
        for (const [startMinute, endMinute] of periods) {
          const candidate = {
            sectionId: section.id,
            facultyId,
            roomId,
            dayOfWeek,
            startMinute,
            endMinute,
          };
          if (isFree(candidate)) {
            slots.push({ ...candidate, courseId: course.id, type: isLab ? "LAB" : "LECTURE" });
            placed++;
            break; // at most one period of a course per day
          }
        }
      }
      if (placed < spec.weeklyHours)
        throw new Error(`Could not schedule ${spec.code} for section ${section.name}`);
    }
  }
  await db.timetableSlot.createMany({
    data: slots.map((s) => ({
      ...s,
      effectiveFrom: semester.startDate,
      effectiveTo: semester.endDate,
    })),
  });

  await db.auditLog.create({
    data: {
      action: "system.seed",
      entityType: "System",
      metadata: { users: 1 + faculty.length + students.length },
    },
  });

  console.log(`
Seed complete.
  Users:     1 admin, ${faculty.length} faculty, ${students.length} students
  Courses:   ${courses.length}   Sections: ${sections.length}   Timetable slots: ${slots.length}

Logins (all must change password on first login):
  Admin     admin       / ${DEFAULT_PASSWORD}
  Faculty   FAC001      / ${DEFAULT_PASSWORD}   (also fac001@${EMAIL_DOMAIN})
  Faculty   FAC002      / ${DEFAULT_PASSWORD}
  Students  26CSE001…26CSE020 / ${DEFAULT_PASSWORD}
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

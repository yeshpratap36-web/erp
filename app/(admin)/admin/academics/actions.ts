"use server";

import { redirect } from "next/navigation";
import { formAction } from "@/lib/actions.server";
import { db } from "@/lib/db";
import {
  addHoliday,
  assignSectionCourse,
  removeSectionCourse,
  saveAcademicYear,
  saveSemester,
} from "@/lib/services/academics";
import {
  academicYearSchema,
  courseSchema,
  departmentSchema,
  holidaySchema,
  idOnlySchema,
  programSchema,
  roomSchema,
  sectionCourseSchema,
  sectionSchema,
  semesterSchema,
} from "@/lib/validators/academics";
import { idField } from "@/lib/validators/common";

const manage = { permission: "academics:manage" } as const;
const BASE = "/admin/academics";

// ── Departments ─────────────────────────────────────────────────────────────

export const createDepartment = formAction(
  { ...manage, schema: departmentSchema, uniqueField: "code" },
  async (input) => {
    await db.department.create({ data: input });
    return { ok: true, message: `Department ${input.code} created` };
  },
);

export const updateDepartment = formAction(
  { ...manage, schema: departmentSchema.extend({ id: idField() }), uniqueField: "code" },
  async ({ id, ...data }) => {
    await db.department.update({ where: { id }, data });
    return { ok: true, message: "Saved" };
  },
);

export const deleteDepartment = formAction({ ...manage, schema: idOnlySchema }, async ({ id }) => {
  await db.department.delete({ where: { id } });
  redirect(`${BASE}/departments`);
});

// ── Programs ────────────────────────────────────────────────────────────────

export const createProgram = formAction(
  { ...manage, schema: programSchema, uniqueField: "code" },
  async (input) => {
    await db.program.create({ data: input });
    return { ok: true, message: `Program ${input.code} created` };
  },
);

export const updateProgram = formAction(
  { ...manage, schema: programSchema.extend({ id: idField() }), uniqueField: "code" },
  async ({ id, ...data }) => {
    await db.program.update({ where: { id }, data });
    return { ok: true, message: "Saved" };
  },
);

export const deleteProgram = formAction({ ...manage, schema: idOnlySchema }, async ({ id }) => {
  await db.program.delete({ where: { id } });
  redirect(`${BASE}/programs`);
});

// ── Academic years, terms, holidays ─────────────────────────────────────────

export const createAcademicYear = formAction(
  { ...manage, schema: academicYearSchema, uniqueField: "name" },
  async (input) => {
    const year = await saveAcademicYear(input);
    redirect(`${BASE}/years/${year.id}`);
  },
);

export const updateAcademicYear = formAction(
  { ...manage, schema: academicYearSchema.and(idOnlySchema), uniqueField: "name" },
  async (input) => {
    await saveAcademicYear(input);
    return { ok: true, message: "Saved" };
  },
);

export const deleteAcademicYear = formAction(
  { ...manage, schema: idOnlySchema },
  async ({ id }) => {
    await db.academicYear.delete({ where: { id } });
    redirect(`${BASE}/years`);
  },
);

export const createSemester = formAction(
  { ...manage, schema: semesterSchema, uniqueField: "term" },
  async (input) => {
    await saveSemester(input);
    return { ok: true, message: `${input.name} created` };
  },
);

export const updateSemester = formAction(
  { ...manage, schema: semesterSchema.and(idOnlySchema), uniqueField: "term" },
  async (input) => {
    await saveSemester(input);
    return { ok: true, message: "Saved" };
  },
);

export const deleteSemester = formAction({ ...manage, schema: idOnlySchema }, async ({ id }) => {
  await db.semester.delete({ where: { id } });
  return { ok: true };
});

export const createHoliday = formAction(
  { ...manage, schema: holidaySchema, uniqueField: "date" },
  async (input) => {
    await addHoliday(input);
    return { ok: true, message: `${input.name} added` };
  },
);

export const deleteHoliday = formAction({ ...manage, schema: idOnlySchema }, async ({ id }) => {
  await db.holiday.delete({ where: { id } });
  return { ok: true };
});

// ── Courses ─────────────────────────────────────────────────────────────────

export const createCourse = formAction(
  { ...manage, schema: courseSchema, uniqueField: "code" },
  async (input) => {
    await db.course.create({ data: input });
    return { ok: true, message: `Course ${input.code} created` };
  },
);

export const updateCourse = formAction(
  { ...manage, schema: courseSchema.extend({ id: idField() }), uniqueField: "code" },
  async ({ id, ...data }) => {
    await db.course.update({ where: { id }, data });
    return { ok: true, message: "Saved" };
  },
);

export const deleteCourse = formAction({ ...manage, schema: idOnlySchema }, async ({ id }) => {
  await db.course.delete({ where: { id } });
  redirect(`${BASE}/courses`);
});

// ── Rooms ───────────────────────────────────────────────────────────────────

export const createRoom = formAction(
  { ...manage, schema: roomSchema, uniqueField: "code" },
  async (input) => {
    await db.room.create({ data: input });
    return { ok: true, message: `Room ${input.code} created` };
  },
);

export const updateRoom = formAction(
  { ...manage, schema: roomSchema.extend({ id: idField() }), uniqueField: "code" },
  async ({ id, ...data }) => {
    await db.room.update({ where: { id }, data });
    return { ok: true, message: "Saved" };
  },
);

export const deleteRoom = formAction({ ...manage, schema: idOnlySchema }, async ({ id }) => {
  await db.room.delete({ where: { id } });
  redirect(`${BASE}/rooms`);
});

// ── Sections ────────────────────────────────────────────────────────────────

export const createSection = formAction(
  { ...manage, schema: sectionSchema, uniqueField: "name" },
  async (input) => {
    const section = await db.section.create({ data: input });
    redirect(`${BASE}/sections/${section.id}`);
  },
);

export const updateSection = formAction(
  { ...manage, schema: sectionSchema.extend({ id: idField() }), uniqueField: "name" },
  async ({ id, ...data }) => {
    await db.section.update({ where: { id }, data });
    return { ok: true, message: "Saved" };
  },
);

export const deleteSection = formAction({ ...manage, schema: idOnlySchema }, async ({ id }) => {
  const [students, sessions, exams] = await Promise.all([
    db.studentProfile.count({ where: { sectionId: id, deletedAt: null } }),
    db.classSession.count({ where: { sectionId: id } }),
    db.exam.count({ where: { sectionId: id } }),
  ]);
  if (students) {
    return { error: `Move this section's ${students} student(s) to another section first.` };
  }
  // Deleting cascades to sessions/attendance and exams/marks — never destroy academic history.
  if (sessions || exams) {
    return { error: "This section has class sessions or exams on record and can't be deleted." };
  }
  await db.section.delete({ where: { id } });
  redirect(`${BASE}/sections`);
});

export const addSectionCourse = formAction(
  { ...manage, schema: sectionCourseSchema },
  async (input) => {
    const { enrolled } = await assignSectionCourse(input);
    return { ok: true, message: `Course assigned · ${enrolled} student(s) enrolled` };
  },
);

export const removeSectionCourseAction = formAction(
  { ...manage, schema: idOnlySchema.extend({ id: idField("Assignment") }) },
  async ({ id }) => {
    await removeSectionCourse(id);
    return { ok: true };
  },
);

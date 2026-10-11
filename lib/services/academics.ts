import "server-only";
import type { z } from "zod";
import { db } from "@/lib/db";
import { FieldValidationError, HttpError, notFound } from "@/lib/errors";
import type {
  academicYearSchema,
  holidaySchema,
  sectionCourseSchema,
  semesterSchema,
} from "@/lib/validators/academics";

type YearInput = z.output<typeof academicYearSchema>;
type SemesterInput = z.output<typeof semesterSchema>;

/** Create or update an academic year; marking it current un-marks every other year. */
export async function saveAcademicYear(input: YearInput & { id?: string }) {
  return db.$transaction(async (tx) => {
    if (input.isCurrent) {
      await tx.academicYear.updateMany({
        where: { isCurrent: true, ...(input.id ? { id: { not: input.id } } : {}) },
        data: { isCurrent: false },
      });
    }
    const { id, ...data } = input;
    return id ? tx.academicYear.update({ where: { id }, data }) : tx.academicYear.create({ data });
  });
}

/** Create or update a term; it must sit inside its academic year, and only one term is current. */
export async function saveSemester(input: SemesterInput & { id?: string }) {
  const year = await db.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!year) throw notFound("Academic year not found");
  if (input.startDate < year.startDate || input.endDate > year.endDate) {
    throw new FieldValidationError({
      startDate: [`Dates must fall within ${year.name}`],
    });
  }
  return db.$transaction(async (tx) => {
    if (input.isCurrent) {
      await tx.semester.updateMany({
        where: { isCurrent: true, ...(input.id ? { id: { not: input.id } } : {}) },
        data: { isCurrent: false },
      });
    }
    const { id, ...data } = input;
    return id ? tx.semester.update({ where: { id }, data }) : tx.semester.create({ data });
  });
}

export async function addHoliday(input: z.output<typeof holidaySchema>) {
  const year = await db.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!year) throw notFound("Academic year not found");
  if (input.date < year.startDate || input.date > year.endDate) {
    throw new FieldValidationError({ date: [`Date must fall within ${year.name}`] });
  }
  return db.holiday.create({ data: input });
}

/**
 * Offer a course to a section, taught by a faculty member, and enroll every student
 * of the section in it. Several faculty may share one course (e.g. lab batches).
 */
export async function assignSectionCourse(input: z.output<typeof sectionCourseSchema>) {
  const [section, course, faculty] = await Promise.all([
    db.section.findUnique({ where: { id: input.sectionId }, select: { id: true } }),
    db.course.findUnique({ where: { id: input.courseId }, select: { id: true } }),
    db.facultyProfile.findFirst({
      where: { id: input.facultyId, deletedAt: null, user: { isActive: true } },
      select: { id: true },
    }),
  ]);
  if (!section) throw notFound("Section not found");
  if (!course) throw new FieldValidationError({ courseId: ["Course not found"] });
  if (!faculty)
    throw new FieldValidationError({ facultyId: ["Faculty member not found or inactive"] });

  const existing = await db.facultyAssignment.findUnique({
    where: { facultyId_sectionId_courseId: input },
  });
  if (existing) {
    throw new FieldValidationError({ courseId: ["This faculty already teaches this course here"] });
  }

  return db.$transaction(async (tx) => {
    await tx.facultyAssignment.create({ data: input });
    const students = await tx.studentProfile.findMany({
      where: { sectionId: input.sectionId, deletedAt: null },
      select: { id: true },
    });
    const enrolled = await tx.enrollment.createMany({
      data: students.map((s) => ({
        studentId: s.id,
        sectionId: input.sectionId,
        courseId: input.courseId,
      })),
      skipDuplicates: true,
    });
    return { enrolled: enrolled.count };
  });
}

/**
 * Remove a faculty assignment. When it was the course's last assignment in the section,
 * the course's enrollments are removed too — unless the course already has history
 * (timetable slots, sessions or exams), in which case removal is refused.
 */
export async function removeSectionCourse(assignmentId: string) {
  const assignment = await db.facultyAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) throw notFound("Assignment not found");
  const { sectionId, courseId, facultyId } = assignment;

  const [slots, sessions, exams, otherTeachers] = await Promise.all([
    db.timetableSlot.count({ where: { sectionId, courseId, facultyId } }),
    db.classSession.count({ where: { sectionId, courseId, facultyId } }),
    db.exam.count({ where: { sectionId, courseId } }),
    db.facultyAssignment.count({ where: { sectionId, courseId, id: { not: assignmentId } } }),
  ]);
  if (slots || sessions) {
    throw new HttpError(
      409,
      "in_use",
      "This faculty has timetable slots or class sessions for this course. Remove those first.",
    );
  }
  const isLast = otherTeachers === 0;
  if (isLast && exams) {
    throw new HttpError(
      409,
      "in_use",
      "This course has exams in this section and can't be removed.",
    );
  }

  await db.$transaction(async (tx) => {
    await tx.facultyAssignment.delete({ where: { id: assignmentId } });
    if (isLast) await tx.enrollment.deleteMany({ where: { sectionId, courseId } });
  });
}

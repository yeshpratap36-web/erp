import { z } from "zod";
import { CourseType, HolidayType, RoomType, Term } from "@/generated/prisma/enums";
import {
  checkboxField,
  codeField,
  dateField,
  idField,
  intField,
  optionalText,
  requiredText,
} from "@/lib/validators/common";

export const idOnlySchema = z.object({ id: idField() });

export const departmentSchema = z.object({
  code: codeField(),
  name: requiredText("Name"),
});

export const programSchema = z.object({
  code: codeField(),
  name: requiredText("Name"),
  degree: requiredText("Degree", 50),
  departmentId: idField("Department"),
  totalSemesters: intField("Total semesters", 1, 12),
});

const dateRange = <T extends { startDate: Date; endDate: Date }>(schema: z.ZodType<T>) =>
  schema.refine((d) => d.startDate < d.endDate, {
    path: ["endDate"],
    message: "End date must be after the start date",
  });

export const academicYearSchema = dateRange(
  z.object({
    name: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}$/, 'Use the format "2026-27"'),
    startDate: dateField("Start date"),
    endDate: dateField("End date"),
    isCurrent: checkboxField(),
  }),
);

export const semesterSchema = dateRange(
  z.object({
    academicYearId: idField("Academic year"),
    name: requiredText("Name"),
    term: z.enum(Term, "Choose a term"),
    startDate: dateField("Start date"),
    endDate: dateField("End date"),
    isCurrent: checkboxField(),
  }),
);

export const holidaySchema = z.object({
  academicYearId: idField("Academic year"),
  date: dateField("Date"),
  name: requiredText("Name"),
  type: z.enum(HolidayType, "Choose a type"),
});

export const courseSchema = z.object({
  code: codeField(),
  name: requiredText("Name"),
  credits: intField("Credits", 0, 20),
  type: z.enum(CourseType, "Choose a type"),
  departmentId: idField("Department"),
  /** Optional: blank → null. */
  semesterNo: z.union([z.literal("").transform(() => null), intField("Semester", 1, 12)]),
});

export const roomSchema = z.object({
  code: codeField(),
  name: requiredText("Name"),
  building: optionalText(),
  capacity: intField("Capacity", 1, 2000),
  type: z.enum(RoomType, "Choose a type"),
});

export const sectionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(20)
    .transform((v) => v.toUpperCase()),
  programId: idField("Program"),
  semesterId: idField("Term"),
  semesterNo: intField("Semester", 1, 12),
  capacity: intField("Capacity", 1, 500),
});

export const sectionCourseSchema = z.object({
  sectionId: idField("Section"),
  courseId: idField("Course"),
  facultyId: idField("Faculty"),
});

import { z } from "zod";
import { ExamType } from "@/generated/prisma/enums";
import { idField, requiredText } from "@/lib/validators/common";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.iso.date("Enter a valid date").nullable())
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null));

export const examSchema = z.object({
  sectionId: idField("Section"),
  courseId: idField("Course"),
  name: requiredText("Name", 80),
  type: z.enum(ExamType, "Choose a type"),
  maxMarks: z.coerce
    .number({ error: "Enter the maximum marks" })
    .positive("Must be more than 0")
    .max(1000),
  weightage: z.coerce.number({ error: "Enter the weightage" }).min(0).max(100, "At most 100%"),
  date: optionalDate,
});

export const examIdSchema = z.object({ examId: idField("Exam") });

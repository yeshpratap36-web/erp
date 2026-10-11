import { z } from "zod";
import {
  codeField,
  emailField,
  idField,
  intField,
  optionalId,
  optionalText,
  phoneField,
  requiredText,
} from "@/lib/validators/common";

const currentYear = new Date().getUTCFullYear();

export const studentSchema = z.object({
  rollNumber: codeField("Roll number"),
  name: requiredText("Name", 120),
  email: emailField(),
  phone: phoneField(),
  programId: idField("Program"),
  sectionId: optionalId(),
  admissionYear: intField("Admission year", 1990, currentYear + 1),
  currentSemesterNo: intField("Current semester", 1, 12),
});

export const facultySchema = z.object({
  employeeId: codeField("Employee ID"),
  name: requiredText("Name", 120),
  email: emailField(),
  phone: phoneField(),
  departmentId: idField("Department"),
  designation: optionalText(100),
});

/** Editing keeps the login identifier (roll number / employee ID) immutable. */
export const studentUpdateSchema = studentSchema
  .omit({ rollNumber: true })
  .extend({ userId: idField() });
export const facultyUpdateSchema = facultySchema
  .omit({ employeeId: true })
  .extend({ userId: idField() });

export const userIdSchema = z.object({ userId: idField() });

export const faceReenrollSchema = z.object({
  userId: idField(),
  allowed: z.enum(["true", "false"]).transform((v) => v === "true"),
});

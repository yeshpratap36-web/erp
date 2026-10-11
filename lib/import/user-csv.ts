/**
 * Pure CSV parsing + validation for bulk account import (no DB access — see
 * lib/services/user-import.ts for the lookups and the commit).
 */
import Papa from "papaparse";
import { z } from "zod";
import { facultySchema, studentSchema } from "@/lib/validators/users";

export type ImportKind = "students" | "faculty";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 1_000_000;

export const IMPORT_COLUMNS: Record<
  ImportKind,
  { name: string; required: boolean; example: string }[]
> = {
  students: [
    { name: "roll_number", required: true, example: "26CSE021" },
    { name: "name", required: true, example: "Asha Kumar" },
    { name: "email", required: true, example: "26cse021@college.edu" },
    { name: "phone", required: false, example: "+91 98765 43210" },
    { name: "program_code", required: true, example: "BTECH-CSE" },
    { name: "semester_no", required: true, example: "3" },
    { name: "section", required: false, example: "A" },
    { name: "admission_year", required: true, example: "2025" },
  ],
  faculty: [
    { name: "employee_id", required: true, example: "FAC003" },
    { name: "name", required: true, example: "Dr. Kiran Shah" },
    { name: "email", required: true, example: "fac003@college.edu" },
    { name: "phone", required: false, example: "" },
    { name: "department_code", required: true, example: "CSE" },
    { name: "designation", required: false, example: "Assistant Professor" },
  ],
};

export type ParsedCsv = { rows: Record<string, string>[]; fileErrors: string[] };

export function parseImportCsv(kind: ImportKind, text: string): ParsedCsv {
  if (text.length > MAX_IMPORT_BYTES) {
    return { rows: [], fileErrors: [`File is too large (max ${MAX_IMPORT_BYTES / 1_000_000} MB)`] };
  }
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    transform: (v) => v.trim(),
  });

  const fileErrors = result.errors
    .filter((e) => e.type !== "FieldMismatch")
    .slice(0, 5)
    .map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);

  const headers = result.meta.fields ?? [];
  const missing = IMPORT_COLUMNS[kind].filter((c) => c.required && !headers.includes(c.name));
  if (missing.length)
    fileErrors.push(`Missing column(s): ${missing.map((c) => c.name).join(", ")}`);
  if (result.data.length === 0) fileErrors.push("The file has no data rows");
  if (result.data.length > MAX_IMPORT_ROWS) {
    fileErrors.push(`Too many rows (${result.data.length}); the limit is ${MAX_IMPORT_ROWS}`);
  }
  return { rows: fileErrors.length ? [] : result.data, fileErrors };
}

export type PreviewRow<T> = {
  /** 1-based data row number (row 1 is the first line after the header). */
  row: number;
  values: Record<string, string>;
  data?: T;
  errors: string[];
};

export type StudentLookups = {
  programIdByCode: Map<string, string>;
  /** Key: `${PROGRAM_CODE}|${semesterNo}|${SECTION}` within the current term. */
  sectionIdByKey: Map<string, string>;
  hasCurrentTerm: boolean;
  existingLoginIds: Set<string>; // lowercase
  existingEmails: Set<string>; // lowercase
};

export type FacultyLookups = {
  departmentIdByCode: Map<string, string>;
  existingLoginIds: Set<string>;
  existingEmails: Set<string>;
};

const FIELD_TO_COLUMN: Record<string, string> = {
  rollNumber: "roll_number",
  employeeId: "employee_id",
  programId: "program_code",
  departmentId: "department_code",
  sectionId: "section",
  admissionYear: "admission_year",
  currentSemesterNo: "semester_no",
};

function zodErrors(error: z.ZodError): string[] {
  const { fieldErrors, formErrors } = z.flattenError(error);
  return [
    ...formErrors,
    ...Object.entries(fieldErrors).map(
      ([field, msgs]) => `${FIELD_TO_COLUMN[field] ?? field}: ${(msgs as string[])[0]}`,
    ),
  ];
}

/** Flags the 2nd+ occurrence of a value within the file. */
function duplicateTracker(label: string) {
  const seen = new Map<string, number>();
  return (value: string | undefined, row: number, errors: string[]) => {
    if (!value) return;
    const key = value.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) errors.push(`${label} duplicates row ${first}`);
    else seen.set(key, row);
  };
}

// Ids come from code lookups, so the CSV fields are validated without them.
const studentCsvSchema = studentSchema.omit({ programId: true, sectionId: true });
const facultyCsvSchema = facultySchema.omit({ departmentId: true });

export function validateStudentRows(rows: Record<string, string>[], lookups: StudentLookups) {
  const dupRoll = duplicateTracker("roll_number");
  const dupEmail = duplicateTracker("email");

  return rows.map((values, i): PreviewRow<z.output<typeof studentSchema>> => {
    const row = i + 1;
    const errors: string[] = [];
    const programCode = values.program_code?.toUpperCase() ?? "";
    const programId = lookups.programIdByCode.get(programCode);
    if (!programCode) errors.push("program_code: Program is required");
    else if (!programId) errors.push(`program_code: unknown program "${values.program_code}"`);

    let sectionId: string | null = null;
    if (values.section) {
      if (!lookups.hasCurrentTerm) {
        errors.push("section: no current term is configured");
      } else {
        const key = `${programCode}|${Number(values.semester_no)}|${values.section.toUpperCase()}`;
        sectionId = lookups.sectionIdByKey.get(key) ?? null;
        if (programId && !sectionId) {
          errors.push(
            `section: no section "${values.section}" for semester ${values.semester_no} in the current term`,
          );
        }
      }
    }

    const parsed = studentCsvSchema.safeParse({
      rollNumber: values.roll_number ?? "",
      name: values.name ?? "",
      email: values.email ?? "",
      phone: values.phone,
      admissionYear: values.admission_year ?? "",
      currentSemesterNo: values.semester_no ?? "",
    });
    if (!parsed.success) errors.push(...zodErrors(parsed.error));

    const roll = values.roll_number?.trim();
    const email = values.email?.trim().toLowerCase();
    if (roll && lookups.existingLoginIds.has(roll.toLowerCase()))
      errors.push("roll_number: already exists");
    if (email && lookups.existingEmails.has(email)) errors.push("email: already in use");
    dupRoll(roll, row, errors);
    dupEmail(email, row, errors);

    const data =
      errors.length === 0 && parsed.success && programId
        ? { ...parsed.data, programId, sectionId }
        : undefined;
    return { row, values, errors, data };
  });
}

export function validateFacultyRows(rows: Record<string, string>[], lookups: FacultyLookups) {
  const dupId = duplicateTracker("employee_id");
  const dupEmail = duplicateTracker("email");

  return rows.map((values, i): PreviewRow<z.output<typeof facultySchema>> => {
    const row = i + 1;
    const errors: string[] = [];
    const deptCode = values.department_code?.toUpperCase() ?? "";
    const departmentId = lookups.departmentIdByCode.get(deptCode);
    if (!deptCode) errors.push("department_code: Department is required");
    else if (!departmentId)
      errors.push(`department_code: unknown department "${values.department_code}"`);

    const parsed = facultyCsvSchema.safeParse({
      employeeId: values.employee_id ?? "",
      name: values.name ?? "",
      email: values.email ?? "",
      phone: values.phone,
      designation: values.designation,
    });
    if (!parsed.success) errors.push(...zodErrors(parsed.error));

    const id = values.employee_id?.trim();
    const email = values.email?.trim().toLowerCase();
    if (id && lookups.existingLoginIds.has(id.toLowerCase()))
      errors.push("employee_id: already exists");
    if (email && lookups.existingEmails.has(email)) errors.push("email: already in use");
    dupId(id, row, errors);
    dupEmail(email, row, errors);

    const data =
      errors.length === 0 && parsed.success && departmentId
        ? { ...parsed.data, departmentId }
        : undefined;
    return { row, values, errors, data };
  });
}

import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import {
  parseImportCsv,
  validateFacultyRows,
  validateStudentRows,
  type StudentLookups,
} from "@/lib/import/user-csv";

const HEADER = "roll_number,name,email,phone,program_code,semester_no,section,admission_year";

const lookups = (overrides: Partial<StudentLookups> = {}): StudentLookups => ({
  programIdByCode: new Map([["BTECH-CSE", "prog1"]]),
  sectionIdByKey: new Map([["BTECH-CSE|3|A", "secA"]]),
  hasCurrentTerm: true,
  existingLoginIds: new Set(["26cse001"]),
  existingEmails: new Set(["taken@college.edu"]),
  ...overrides,
});

function students(...lines: string[]) {
  const { rows, fileErrors } = parseImportCsv("students", [HEADER, ...lines].join("\n"));
  expect(fileErrors).toEqual([]);
  return validateStudentRows(rows, lookups());
}

describe("parseImportCsv", () => {
  it("normalizes headers, strips BOM and blank lines", () => {
    const text =
      "﻿Roll Number,Name,EMAIL,Program Code,Semester No,Admission Year\n26CSE050,A B,a@b.edu,BTECH-CSE,3,2025\n\n";
    const { rows, fileErrors } = parseImportCsv("students", text);
    expect(fileErrors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].roll_number).toBe("26CSE050");
  });

  it("reports missing required columns", () => {
    const { fileErrors } = parseImportCsv("students", "name,email\nA,a@b.edu");
    expect(fileErrors[0]).toMatch(/roll_number.*program_code/);
  });

  it("rejects empty files", () => {
    expect(
      parseImportCsv("faculty", "employee_id,name,email,department_code\n").fileErrors,
    ).toContain("The file has no data rows");
  });

  it("handles quoted commas", () => {
    const { rows } = parseImportCsv(
      "students",
      `${HEADER}\n26CSE051,"Rao, Priya",p@c.edu,,BTECH-CSE,3,A,2025`,
    );
    expect(rows[0].name).toBe("Rao, Priya");
  });
});

describe("validateStudentRows", () => {
  it("accepts a valid row and resolves program + section ids", () => {
    const [row] = students("26cse050,Asha Kumar,Asha@College.edu,,btech-cse,3,a,2025");
    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({
      rollNumber: "26CSE050",
      email: "asha@college.edu",
      programId: "prog1",
      sectionId: "secA",
      currentSemesterNo: 3,
    });
  });

  it("allows a blank section", () => {
    const [row] = students("26CSE052,B,b@c.edu,,BTECH-CSE,3,,2025");
    expect(row.errors).toEqual([]);
    expect(row.data?.sectionId).toBeNull();
  });

  it("flags unknown program, unknown section, bad email and existing ids", () => {
    const rows = students(
      "26CSE060,C,c@c.edu,,MBA,3,,2025",
      "26CSE061,D,d@c.edu,,BTECH-CSE,3,Z,2025",
      "26CSE062,E,not-an-email,,BTECH-CSE,3,,2025",
      "26CSE001,F,taken@college.edu,,BTECH-CSE,3,,2025",
    );
    expect(rows[0].errors.join()).toMatch(/unknown program/);
    expect(rows[1].errors.join()).toMatch(/no section "Z"/);
    expect(rows[2].errors.join()).toMatch(/email: Enter a valid email/);
    expect(rows[3].errors.join()).toMatch(/roll_number: already exists/);
    expect(rows[3].errors.join()).toMatch(/email: already in use/);
    expect(rows.every((r) => r.data === undefined)).toBe(true);
  });

  it("flags duplicates within the file (case-insensitive) on the later row", () => {
    const rows = students(
      "26CSE070,G,g@c.edu,,BTECH-CSE,3,,2025",
      "26cse070,H,G@C.EDU,,BTECH-CSE,3,,2025",
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toEqual(["roll_number duplicates row 1", "email duplicates row 1"]);
  });

  it("refuses sections when no term is current", () => {
    const { rows } = parseImportCsv(
      "students",
      `${HEADER}\n26CSE080,I,i@c.edu,,BTECH-CSE,3,A,2025`,
    );
    const [row] = validateStudentRows(rows, lookups({ hasCurrentTerm: false }));
    expect(row.errors).toContain("section: no current term is configured");
  });
});

describe("validateFacultyRows", () => {
  it("resolves departments and validates fields", () => {
    const { rows } = parseImportCsv(
      "faculty",
      "employee_id,name,email,department_code,designation\nfac010,Dr X,x@c.edu,cse,Professor\nFAC011,Y,y@c.edu,EEE,",
    );
    const result = validateFacultyRows(rows, {
      departmentIdByCode: new Map([["CSE", "dept1"]]),
      existingLoginIds: new Set(),
      existingEmails: new Set(),
    });
    expect(result[0].data).toMatchObject({
      employeeId: "FAC010",
      departmentId: "dept1",
      designation: "Professor",
    });
    expect(result[1].errors.join()).toMatch(/unknown department "EEE"/);
  });
});

describe("toCsv", () => {
  it("quotes special characters and neutralizes formulas", () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: "x,y", c: "+1", d: null }]);
    expect(csv.split("\r\n")[1]).toBe(`"'=HYPERLINK(""x"")","x,y",'+1,`);
  });
});

import "server-only";
import { Role } from "@/generated/prisma/enums";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import {
  parseImportCsv,
  validateFacultyRows,
  validateStudentRows,
  type ImportKind,
  type PreviewRow,
} from "@/lib/import/user-csv";
import { requestContext } from "@/lib/request";
import {
  enrollInSectionCourses,
  type FacultyInput,
  type IssuedCredential,
  type StudentInput,
} from "@/lib/services/users";

export type ImportPreview = {
  fileErrors: string[];
  rows: Pick<PreviewRow<unknown>, "row" | "values" | "errors">[];
  validCount: number;
  errorCount: number;
};

async function existingIdentities(loginIds: string[], emails: string[]) {
  const users = await db.user.findMany({
    where: {
      OR: [
        { loginId: { in: loginIds, mode: "insensitive" } },
        { email: { in: emails.map((e) => e.toLowerCase()) } },
      ],
    },
    select: { loginId: true, email: true },
  });
  return {
    existingLoginIds: new Set(users.map((u) => u.loginId.toLowerCase())),
    existingEmails: new Set(users.map((u) => u.email.toLowerCase())),
  };
}

type Validated =
  | { kind: "students"; fileErrors: string[]; rows: PreviewRow<StudentInput>[] }
  | { kind: "faculty"; fileErrors: string[]; rows: PreviewRow<FacultyInput>[] };

async function validate(kind: ImportKind, text: string): Promise<Validated> {
  const { rows, fileErrors } = parseImportCsv(kind, text);
  if (fileErrors.length) return { kind, fileErrors, rows: [] };

  const emails = rows.map((r) => r.email ?? "").filter(Boolean);

  if (kind === "students") {
    const [programs, currentTerm, identities] = await Promise.all([
      db.program.findMany({ select: { id: true, code: true } }),
      db.semester.findFirst({
        where: { isCurrent: true },
        select: {
          sections: {
            select: { id: true, name: true, semesterNo: true, program: { select: { code: true } } },
          },
        },
      }),
      existingIdentities(rows.map((r) => r.roll_number ?? "").filter(Boolean), emails),
    ]);
    return {
      kind,
      fileErrors,
      rows: validateStudentRows(rows, {
        programIdByCode: new Map(programs.map((p) => [p.code, p.id])),
        sectionIdByKey: new Map(
          (currentTerm?.sections ?? []).map((s) => [
            `${s.program.code}|${s.semesterNo}|${s.name}`,
            s.id,
          ]),
        ),
        hasCurrentTerm: !!currentTerm,
        ...identities,
      }),
    };
  }

  const [departments, identities] = await Promise.all([
    db.department.findMany({ select: { id: true, code: true } }),
    existingIdentities(rows.map((r) => r.employee_id ?? "").filter(Boolean), emails),
  ]);
  return {
    kind,
    fileErrors,
    rows: validateFacultyRows(rows, {
      departmentIdByCode: new Map(departments.map((d) => [d.code, d.id])),
      ...identities,
    }),
  };
}

export async function previewImport(kind: ImportKind, text: string): Promise<ImportPreview> {
  const { fileErrors, rows } = await validate(kind, text);
  const errorCount = rows.filter((r) => r.errors.length).length;
  return {
    fileErrors,
    rows: rows.map(({ row, values, errors }) => ({ row, values, errors })),
    validCount: rows.length - errorCount,
    errorCount,
  };
}

/** Hash with bounded concurrency — argon2 is deliberately memory/CPU heavy. */
async function hashAll(passwords: string[], concurrency = 4) {
  const out: string[] = new Array(passwords.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < passwords.length) {
        const i = next++;
        out[i] = await hashPassword(passwords[i]);
      }
    }),
  );
  return out;
}

/**
 * Re-validates the same CSV server-side and creates every account in one transaction
 * (all or nothing). Returns the temporary passwords — shown to the admin exactly once.
 */
export async function commitImport(
  kind: ImportKind,
  text: string,
  actorId: string,
): Promise<IssuedCredential[]> {
  const result = await validate(kind, text);
  if (result.fileErrors.length || result.rows.some((r) => r.errors.length || !r.data)) {
    throw new HttpError(
      422,
      "invalid_import",
      "The file has errors. Preview it again and fix them first.",
    );
  }

  const tempPasswords = result.rows.map(() => generateTempPassword());
  const hashes = await hashAll(tempPasswords);

  const created = await db.$transaction(
    async (tx) => {
      const users: { userId: string; loginId: string; name: string }[] = [];
      if (result.kind === "students") {
        for (const [i, { data: d }] of result.rows.entries()) {
          const profile = await tx.studentProfile.create({
            data: {
              rollNumber: d!.rollNumber,
              program: { connect: { id: d!.programId } },
              section: d!.sectionId ? { connect: { id: d!.sectionId } } : undefined,
              admissionYear: d!.admissionYear,
              currentSemesterNo: d!.currentSemesterNo,
              user: {
                create: {
                  loginId: d!.rollNumber,
                  email: d!.email,
                  name: d!.name,
                  phone: d!.phone,
                  role: Role.STUDENT,
                  passwordHash: hashes[i],
                },
              },
            },
          });
          if (d!.sectionId) await enrollInSectionCourses(tx, profile.id, d!.sectionId);
          users.push({ userId: profile.userId, loginId: d!.rollNumber, name: d!.name });
        }
      } else {
        for (const [i, { data: d }] of result.rows.entries()) {
          const profile = await tx.facultyProfile.create({
            data: {
              employeeId: d!.employeeId,
              designation: d!.designation,
              department: { connect: { id: d!.departmentId } },
              user: {
                create: {
                  loginId: d!.employeeId,
                  email: d!.email,
                  name: d!.name,
                  phone: d!.phone,
                  role: Role.FACULTY,
                  passwordHash: hashes[i],
                },
              },
            },
          });
          users.push({ userId: profile.userId, loginId: d!.employeeId, name: d!.name });
        }
      }

      const ctx = await requestContext();
      await tx.auditLog.createMany({
        data: users.map((u) => ({
          actorId,
          action: "user.created",
          entityType: "User",
          entityId: u.userId,
          metadata: {
            role: kind === "students" ? "STUDENT" : "FACULTY",
            loginId: u.loginId,
            via: "csv",
          },
          ...ctx,
        })),
      });
      return users;
    },
    { timeout: 120_000 },
  );

  return created.map((u, i) => ({ ...u, tempPassword: tempPasswords[i] }));
}

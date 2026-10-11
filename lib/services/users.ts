import "server-only";
import { Role } from "@/generated/prisma/enums";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { FieldValidationError, HttpError, notFound } from "@/lib/errors";
import type {
  facultySchema,
  facultyUpdateSchema,
  studentSchema,
  studentUpdateSchema,
} from "@/lib/validators/users";

type Tx = Prisma.TransactionClient;
export type StudentInput = z.output<typeof studentSchema>;
export type FacultyInput = z.output<typeof facultySchema>;

/** Returned once to the admin; never stored or logged in plain text. */
export type IssuedCredential = {
  userId: string;
  loginId: string;
  name: string;
  tempPassword: string;
};

// ── Validation helpers ──────────────────────────────────────────────────────

async function assertUniqueIdentity(
  { loginId, email }: { loginId?: string; email: string },
  loginField: string,
  excludeUserId?: string,
) {
  const clashes = await db.user.findMany({
    where: {
      id: excludeUserId ? { not: excludeUserId } : undefined,
      OR: [
        { email },
        ...(loginId ? [{ loginId: { equals: loginId, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { email: true, loginId: true },
  });
  const errors: Record<string, string[]> = {};
  if (clashes.some((u) => u.email === email)) errors.email = ["This email is already in use"];
  if (loginId && clashes.some((u) => u.loginId.toLowerCase() === loginId.toLowerCase())) {
    errors[loginField] = ["This ID is already in use"];
  }
  if (Object.keys(errors).length) throw new FieldValidationError(errors);
}

async function assertSectionMatchesProgram(sectionId: string | null, programId: string) {
  if (!sectionId) return;
  const section = await db.section.findUnique({
    where: { id: sectionId },
    select: { programId: true },
  });
  if (!section || section.programId !== programId) {
    throw new FieldValidationError({
      sectionId: ["Section does not belong to the selected program"],
    });
  }
}

/** Enroll a student in every course offered to a section (courses with a faculty assignment). */
export async function enrollInSectionCourses(tx: Tx, studentId: string, sectionId: string) {
  const offerings = await tx.facultyAssignment.findMany({
    where: { sectionId },
    select: { courseId: true },
    distinct: ["courseId"],
  });
  if (!offerings.length) return;
  await tx.enrollment.createMany({
    data: offerings.map((o) => ({ studentId, sectionId, courseId: o.courseId })),
    skipDuplicates: true,
  });
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createStudent(
  input: StudentInput,
  actorId: string,
): Promise<IssuedCredential> {
  await assertUniqueIdentity({ loginId: input.rollNumber, email: input.email }, "rollNumber");
  await assertSectionMatchesProgram(input.sectionId, input.programId);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const profile = await db.$transaction(async (tx) => {
    const created = await tx.studentProfile.create({
      data: {
        rollNumber: input.rollNumber,
        program: { connect: { id: input.programId } },
        section: input.sectionId ? { connect: { id: input.sectionId } } : undefined,
        admissionYear: input.admissionYear,
        currentSemesterNo: input.currentSemesterNo,
        user: {
          create: {
            loginId: input.rollNumber,
            email: input.email,
            name: input.name,
            phone: input.phone,
            role: Role.STUDENT,
            passwordHash,
          },
        },
      },
    });
    if (input.sectionId) await enrollInSectionCourses(tx, created.id, input.sectionId);
    return created;
  });

  await audit({
    actorId,
    action: "user.created",
    entityType: "User",
    entityId: profile.userId,
    metadata: { role: Role.STUDENT, loginId: input.rollNumber, via: "form" },
  });
  return { userId: profile.userId, loginId: input.rollNumber, name: input.name, tempPassword };
}

export async function createFaculty(
  input: FacultyInput,
  actorId: string,
): Promise<IssuedCredential> {
  await assertUniqueIdentity({ loginId: input.employeeId, email: input.email }, "employeeId");

  const tempPassword = generateTempPassword();
  const profile = await db.facultyProfile.create({
    data: {
      employeeId: input.employeeId,
      designation: input.designation,
      department: { connect: { id: input.departmentId } },
      user: {
        create: {
          loginId: input.employeeId,
          email: input.email,
          name: input.name,
          phone: input.phone,
          role: Role.FACULTY,
          passwordHash: await hashPassword(tempPassword),
        },
      },
    },
  });

  await audit({
    actorId,
    action: "user.created",
    entityType: "User",
    entityId: profile.userId,
    metadata: { role: Role.FACULTY, loginId: input.employeeId, via: "form" },
  });
  return { userId: profile.userId, loginId: input.employeeId, name: input.name, tempPassword };
}

// ── Update ──────────────────────────────────────────────────────────────────

export async function updateStudent(input: z.output<typeof studentUpdateSchema>, actorId: string) {
  const existing = await db.user.findUnique({
    where: { id: input.userId },
    include: { studentProfile: true },
  });
  if (!existing?.studentProfile) throw notFound("Student not found");
  const profile = existing.studentProfile;

  await assertUniqueIdentity({ email: input.email }, "email", input.userId);
  await assertSectionMatchesProgram(input.sectionId, input.programId);

  const sectionChanged = profile.sectionId !== input.sectionId;
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { name: input.name, email: input.email, phone: input.phone },
    });
    await tx.studentProfile.update({
      where: { id: profile.id },
      data: {
        programId: input.programId,
        sectionId: input.sectionId,
        admissionYear: input.admissionYear,
        currentSemesterNo: input.currentSemesterNo,
      },
    });
    if (sectionChanged) {
      // Move course enrollments with the student. Attendance/marks history stays intact.
      if (profile.sectionId) {
        await tx.enrollment.deleteMany({
          where: { studentId: profile.id, sectionId: profile.sectionId },
        });
      }
      if (input.sectionId) await enrollInSectionCourses(tx, profile.id, input.sectionId);
    }
  });

  await audit({
    actorId,
    action: "user.updated",
    entityType: "User",
    entityId: input.userId,
    metadata: { sectionChanged, emailChanged: existing.email !== input.email },
  });
}

export async function updateFaculty(input: z.output<typeof facultyUpdateSchema>, actorId: string) {
  const existing = await db.user.findUnique({
    where: { id: input.userId },
    include: { facultyProfile: true },
  });
  if (!existing?.facultyProfile) throw notFound("Faculty member not found");

  await assertUniqueIdentity({ email: input.email }, "email", input.userId);
  await db.$transaction([
    db.user.update({
      where: { id: input.userId },
      data: { name: input.name, email: input.email, phone: input.phone },
    }),
    db.facultyProfile.update({
      where: { id: existing.facultyProfile.id },
      data: { departmentId: input.departmentId, designation: input.designation },
    }),
  ]);

  await audit({ actorId, action: "user.updated", entityType: "User", entityId: input.userId });
}

// ── Account management ──────────────────────────────────────────────────────

async function getManagedUser(userId: string, actorId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw notFound("User not found");
  if (user.id === actorId)
    throw new HttpError(400, "self_action", "You can't do this to your own account");
  return user;
}

/** New temporary password; forces a change on next login and signs out every session. */
export async function resetPassword(userId: string, actorId: string): Promise<IssuedCredential> {
  const user = await getManagedUser(userId, actorId);
  const tempPassword = generateTempPassword();
  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionVersion: { increment: 1 },
    },
  });
  await audit({ actorId, action: "auth.password_reset", entityType: "User", entityId: userId });
  return { userId, loginId: user.loginId, name: user.name, tempPassword };
}

export async function setUserActive(userId: string, active: boolean, actorId: string) {
  await getManagedUser(userId, actorId);
  await db.user.update({
    where: { id: userId },
    // Deactivation also revokes every outstanding session.
    data: active ? { isActive: true } : { isActive: false, sessionVersion: { increment: 1 } },
  });
  await audit({
    actorId,
    action: active ? "user.reactivated" : "user.deactivated",
    entityType: "User",
    entityId: userId,
  });
}

export async function unlockUser(userId: string, actorId: string) {
  await getManagedUser(userId, actorId);
  await db.user.update({
    where: { id: userId },
    data: { lockedUntil: null, failedLoginAttempts: 0 },
  });
  await audit({ actorId, action: "user.unlocked", entityType: "User", entityId: userId });
}

export async function setFaceReenrollAllowed(userId: string, allowed: boolean, actorId: string) {
  const profile = await db.studentProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw notFound("Student not found");
  await db.studentProfile.update({
    where: { id: profile.id },
    data: { faceReenrollAllowed: allowed },
  });
  await audit({
    actorId,
    action: "user.updated",
    entityType: "User",
    entityId: userId,
    metadata: { faceReenrollAllowed: allowed },
  });
}

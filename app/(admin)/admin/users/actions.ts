"use server";

import { z } from "zod";
import { formAction } from "@/lib/actions.server";
import { deleteBiometricData } from "@/lib/services/face-enrollment";
import {
  createFaculty,
  createStudent,
  resetPassword,
  setFaceReenrollAllowed,
  setUserActive,
  unlockUser,
  updateFaculty,
  updateStudent,
  type IssuedCredential,
} from "@/lib/services/users";
import {
  faceReenrollSchema,
  facultySchema,
  facultyUpdateSchema,
  studentSchema,
  studentUpdateSchema,
  userIdSchema,
} from "@/lib/validators/users";

const manage = { permission: "users:manage" } as const;

export const createStudentAction = formAction<typeof studentSchema, IssuedCredential>(
  { ...manage, schema: studentSchema },
  async (input, admin) => ({ ok: true, data: await createStudent(input, admin.id) }),
);

export const createFacultyAction = formAction<typeof facultySchema, IssuedCredential>(
  { ...manage, schema: facultySchema },
  async (input, admin) => ({ ok: true, data: await createFaculty(input, admin.id) }),
);

export const updateStudentAction = formAction(
  { ...manage, schema: studentUpdateSchema },
  async (input, admin) => {
    await updateStudent(input, admin.id);
    return { ok: true, message: "Saved" };
  },
);

export const updateFacultyAction = formAction(
  { ...manage, schema: facultyUpdateSchema },
  async (input, admin) => {
    await updateFaculty(input, admin.id);
    return { ok: true, message: "Saved" };
  },
);

export const resetPasswordAction = formAction<typeof userIdSchema, IssuedCredential>(
  { ...manage, schema: userIdSchema },
  async ({ userId }, admin) => ({ ok: true, data: await resetPassword(userId, admin.id) }),
);

export const setActiveAction = formAction(
  { ...manage, schema: userIdSchema.extend({ active: z.enum(["true", "false"]) }) },
  async ({ userId, active }, admin) => {
    await setUserActive(userId, active === "true", admin.id);
  },
);

export const unlockAction = formAction(
  { ...manage, schema: userIdSchema },
  async ({ userId }, admin) => {
    await unlockUser(userId, admin.id);
  },
);

// Faculty may also grant re-enrollment (scoped to their sections) — added with the faculty views.
export const setFaceReenrollAction = formAction(
  { ...manage, schema: faceReenrollSchema },
  async ({ userId, allowed }, admin) => {
    await setFaceReenrollAllowed(userId, allowed, admin.id);
  },
);

export const deleteBiometricDataAction = formAction(
  { ...manage, schema: userIdSchema },
  async ({ userId }, admin) => {
    await deleteBiometricData(userId, admin.id);
  },
);

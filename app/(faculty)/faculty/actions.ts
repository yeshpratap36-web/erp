"use server";

import { z } from "zod";
import { formAction } from "@/lib/actions.server";
import { assertStudentAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { setFaceReenrollAllowed } from "@/lib/services/users";
import { idField } from "@/lib/validators/common";
import { cancelClass, restoreOrRemoveSession, scheduleExtraClass } from "@/lib/services/timetable";
import { cancelClassSchema, extraClassSchema, sessionIdSchema } from "@/lib/validators/timetable";

// Ownership (faculty may only change their own classes) is enforced in the service.
const propose = { permission: "timetable:propose:assigned" } as const;

export const cancelClassAction = formAction(
  { ...propose, schema: cancelClassSchema },
  async (input, user) => {
    await cancelClass(input, user);
    return { ok: true };
  },
);

export const restoreSessionAction = formAction(
  { ...propose, schema: sessionIdSchema },
  async ({ sessionId }, user) => {
    await restoreOrRemoveSession(sessionId, user);
    return { ok: true };
  },
);

export const scheduleExtraClassAction = formAction(
  { ...propose, schema: extraClassSchema },
  async (input, user) => {
    await scheduleExtraClass(input, user);
    return { ok: true, message: "Extra class scheduled" };
  },
);

/** Faculty may allow face re-enrollment only for students in sections they teach. */
export const setStudentFaceReenrollAction = formAction(
  {
    permission: "face:reenroll:allow",
    schema: z.object({
      studentId: idField("Student"),
      allowed: z.enum(["true", "false"]).transform((v) => v === "true"),
    }),
  },
  async ({ studentId, allowed }, user) => {
    await assertStudentAccess(user, studentId);
    const profile = await db.studentProfile.findUniqueOrThrow({
      where: { id: studentId },
      select: { userId: true },
    });
    await setFaceReenrollAllowed(profile.userId, allowed, user.id);
  },
);

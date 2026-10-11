"use server";

import { formAction } from "@/lib/actions.server";
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

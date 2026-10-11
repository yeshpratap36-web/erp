"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { AttendanceStatus } from "@/generated/prisma/enums";
import { formAction } from "@/lib/actions.server";
import { assertStudentAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { setFaceReenrollAllowed } from "@/lib/services/users";
import { dateField, idField } from "@/lib/validators/common";
import {
  finalizeAttendance,
  openSession,
  processPhotos,
  retryPhoto,
} from "@/lib/services/face-attendance";
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

// ── Attendance ──────────────────────────────────────────────────────────────

const take = { permission: "attendance:take:assigned" } as const;

/** Open (or create) the class session for an occurrence and go to its attendance page. */
export const openSessionAction = formAction(
  {
    ...take,
    schema: z.union([
      z.object({ sessionId: idField("Class") }),
      z.object({ slotId: idField("Class"), date: dateField("Date") }),
    ]),
  },
  async (input, user) => {
    const sessionId = await openSession(input, user);
    redirect(`/faculty/sessions/${sessionId}`);
  },
);

const STATUS_PREFIX = "status:";

/** Confirm attendance. Form fields: sessionId + one `status:<studentId>` per student. */
export const finalizeAttendanceAction = formAction(
  { ...take, schema: z.object({ sessionId: idField("Class") }).catchall(z.string()) },
  async ({ sessionId, ...fields }, user) => {
    const statuses = new Map<string, AttendanceStatus>();
    for (const [key, value] of Object.entries(fields)) {
      if (!key.startsWith(STATUS_PREFIX)) continue;
      const status = z.enum(AttendanceStatus).safeParse(value);
      if (!status.success) return { error: "Invalid attendance status." };
      statuses.set(key.slice(STATUS_PREFIX.length), status.data);
    }
    await finalizeAttendance(sessionId, user, statuses);
    return { ok: true, message: "Attendance confirmed" };
  },
);

export const retryPhotoAction = formAction(
  { ...take, schema: z.object({ photoId: idField("Photo"), sessionId: idField("Class") }) },
  async ({ photoId, sessionId }, user) => {
    const queued = await retryPhoto(photoId, user);
    after(() => processPhotos(sessionId, queued));
  },
);

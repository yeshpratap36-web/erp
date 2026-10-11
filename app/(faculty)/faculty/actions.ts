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
import { examIdSchema, examSchema } from "@/lib/validators/exams";
import {
  finalizeAttendance,
  openSession,
  processPhotos,
  retryPhoto,
} from "@/lib/services/face-attendance";
import {
  createExam,
  deleteExam,
  importMarksCsv,
  publishCourseResults,
  saveMarks,
  setExamPublished,
  type MarkEntry,
} from "@/lib/services/exams";
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

// ── Exams & marks (scope checked in lib/services/exams.ts) ──────────────────

const marks = { permission: "marks:enter:assigned" } as const;

export const createExamAction = formAction(
  { ...marks, schema: examSchema },
  async (input, user) => {
    await createExam(input, user);
    return { ok: true, message: `${input.name} created` };
  },
);

export const deleteExamAction = formAction(
  { ...marks, schema: examIdSchema.extend({ back: z.string().startsWith("/faculty/") }) },
  async ({ examId, back }, user) => {
    await deleteExam(examId, user);
    redirect(back);
  },
);

export const setExamPublishedAction = formAction(
  { ...marks, schema: examIdSchema.extend({ published: z.enum(["true", "false"]) }) },
  async ({ examId, published }, user) => {
    await setExamPublished(examId, published === "true", user);
  },
);

const MARK_PREFIX = "mark:";
const ABSENT_PREFIX = "absent:";

/** Marks grid: fields `mark:<studentId>` (number or blank) and `absent:<studentId>` ("on"). */
export const saveMarksAction = formAction(
  { ...marks, schema: examIdSchema.catchall(z.string()) },
  async ({ examId, ...fields }, user) => {
    const entries: MarkEntry[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (!key.startsWith(MARK_PREFIX)) continue;
      const studentId = key.slice(MARK_PREFIX.length);
      const isAbsent = fields[`${ABSENT_PREFIX}${studentId}`] === "on";
      const trimmed = value.trim();
      const num = trimmed === "" ? null : Number(trimmed);
      if (num !== null && !Number.isFinite(num)) return { error: "Marks must be numbers." };
      entries.push({ studentId, marksObtained: isAbsent ? null : num, isAbsent });
    }
    const { changed } = await saveMarks(examId, entries, user);
    return {
      ok: true,
      message: changed ? `Saved ${changed} change${changed === 1 ? "" : "s"}` : "No changes",
    };
  },
);

export const importMarksAction = formAction(
  {
    ...marks,
    schema: examIdSchema.extend({ csv: z.string().min(1, "Choose a CSV file").max(200_000) }),
    sensitiveFields: ["csv"],
  },
  async ({ examId, csv }, user) => {
    const { changed } = await importMarksCsv(examId, csv, user);
    return { ok: true, message: `Imported · ${changed} change${changed === 1 ? "" : "s"}` };
  },
);

export const publishResultsAction = formAction(
  { ...marks, schema: z.object({ sectionId: idField("Section"), courseId: idField("Course") }) },
  async ({ sectionId, courseId }, user) => {
    await publishCourseResults(sectionId, courseId, user);
    return { ok: true, message: "Final grades published to students" };
  },
);

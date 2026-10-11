"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formAction } from "@/lib/actions.server";
import { safeCallbackPath } from "@/lib/auth/routing";
import { ROLE_HOME } from "@/lib/permissions";
import { deleteAnnouncement, postAnnouncement } from "@/lib/services/announcements";
import { markAllRead, markRead } from "@/lib/services/notifications";
import {
  cancelOwnRequest,
  createCorrection,
  createLeave,
  reviewCorrection,
  reviewLeave,
} from "@/lib/services/requests";
import { idField } from "@/lib/validators/common";
import {
  announcementSchema,
  correctionRequestSchema,
  leaveRequestSchema,
  requestIdSchema,
  reviewSchema,
} from "@/lib/validators/communication";

// Every action re-checks role/ownership in its service; these permissions are the first gate.

// ── Notifications ───────────────────────────────────────────────────────────

export const openNotificationAction = formAction(
  { permission: "profile:read:own", schema: z.object({ id: idField("Notification") }) },
  async ({ id }, user) => {
    const link = await markRead(user, id);
    // The redirect only renders the target page; refresh() also updates the shared layout
    // (the header bell's unread count).
    refresh();
    redirect(safeCallbackPath(link) ?? `${ROLE_HOME[user.role]}/notifications`);
  },
);

export const markAllReadAction = formAction(
  { permission: "profile:read:own", schema: z.object({}) },
  async (_input, user) => {
    await markAllRead(user);
  },
);

// ── Announcements ───────────────────────────────────────────────────────────

export const postAnnouncementAction = formAction(
  { permission: "announcements:read", schema: announcementSchema },
  async (input, user) => {
    await postAnnouncement(input, user);
    return { ok: true, message: "Announcement posted" };
  },
);

export const deleteAnnouncementAction = formAction(
  { permission: "announcements:read", schema: z.object({ id: idField("Announcement") }) },
  async ({ id }, user) => {
    await deleteAnnouncement(id, user);
  },
);

// ── Requests (students) ─────────────────────────────────────────────────────

export const createLeaveAction = formAction(
  { permission: "requests:create:own", schema: leaveRequestSchema },
  async (input, user) => {
    await createLeave(input, user);
    return { ok: true, message: "Leave request sent to your teachers" };
  },
);

export const createCorrectionAction = formAction(
  { permission: "requests:create:own", schema: correctionRequestSchema },
  async (input, user) => {
    await createCorrection(input, user);
    return { ok: true, message: "Correction request sent to your teacher" };
  },
);

export const cancelRequestAction = formAction(
  {
    permission: "requests:create:own",
    schema: requestIdSchema.extend({ kind: z.enum(["leave", "correction"]) }),
  },
  async ({ kind, requestId }, user) => {
    await cancelOwnRequest(kind, requestId, user);
  },
);

// ── Requests (faculty / admin) ──────────────────────────────────────────────

export const reviewLeaveAction = formAction(
  { permission: "requests:review:assigned", schema: reviewSchema },
  async (input, user) => {
    const { excused } = await reviewLeave(input, user);
    return {
      ok: true,
      message:
        input.decision === "APPROVED"
          ? `Approved${excused ? ` · ${excused} absence${excused === 1 ? "" : "s"} marked excused` : ""}`
          : "Rejected",
    };
  },
);

export const reviewCorrectionAction = formAction(
  { permission: "requests:review:assigned", schema: reviewSchema },
  async (input, user) => {
    await reviewCorrection(input, user);
    return {
      ok: true,
      message: input.decision === "APPROVED" ? "Approved · attendance updated" : "Rejected",
    };
  },
);

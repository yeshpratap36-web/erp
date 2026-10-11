import { z } from "zod";
import { AnnouncementAudience, Role } from "@/generated/prisma/enums";
import { dateField, idField, optionalId } from "@/lib/validators/common";

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3, "Title is too short").max(150),
    body: z.string().trim().min(1, "Write the announcement").max(5000),
    audience: z.enum(AnnouncementAudience, "Choose who should see it"),
    targetRole: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.enum(Role).nullable()),
    departmentId: optionalId(),
    sectionId: optionalId(),
    expiresAt: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.iso.date().nullable())
      .transform((v) => (v ? new Date(`${v}T23:59:59.999Z`) : null)),
  })
  .superRefine((a, ctx) => {
    if (a.audience === "ROLE" && !a.targetRole)
      ctx.addIssue({ code: "custom", path: ["targetRole"], message: "Choose a role" });
    if (a.audience === "DEPARTMENT" && !a.departmentId)
      ctx.addIssue({ code: "custom", path: ["departmentId"], message: "Choose a department" });
    if (a.audience === "SECTION" && !a.sectionId)
      ctx.addIssue({ code: "custom", path: ["sectionId"], message: "Choose a section" });
  });

export const leaveRequestSchema = z.object({
  fromDate: dateField("Start date"),
  toDate: dateField("End date"),
  reason: z.string().trim().min(10, "Please give a little more detail (10+ characters)").max(1000),
});

export const correctionRequestSchema = z.object({
  sessionId: idField("Class"),
  requestedStatus: z.enum(["PRESENT", "LATE", "EXCUSED"], "Choose the correct status"),
  reason: z.string().trim().min(10, "Please explain what happened (10+ characters)").max(1000),
});

export const reviewSchema = z.object({
  requestId: idField("Request"),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
});

export const requestIdSchema = z.object({ requestId: idField("Request") });

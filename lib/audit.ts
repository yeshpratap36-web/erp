import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requestContext } from "@/lib/request";

/** Audit action names — keep stable, they are queried by the audit log viewer. */
export type AuditAction =
  | "auth.login_succeeded"
  | "auth.login_failed"
  | "auth.account_locked"
  | "auth.password_changed"
  | "auth.password_reset"
  | "user.created"
  | "user.updated"
  | "user.deactivated"
  | "user.reactivated"
  | "user.unlocked"
  | "user.role_changed"
  | "attendance.overridden"
  | "marks.edited"
  | "settings.updated"
  | "biometric.consent_given"
  | "biometric.data_deleted";

type AuditInput = {
  actorId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Never put secrets (passwords, tokens, embeddings) here. */
  metadata?: Prisma.InputJsonValue;
  /** Pass explicitly when called outside a request scope (e.g. Auth.js authorize()). */
  context?: { ipAddress: string | null; userAgent: string | null };
};

export async function audit({ context, ...entry }: AuditInput): Promise<void> {
  const ctx = context ?? (await requestContext());
  try {
    await db.auditLog.create({ data: { ...entry, ...ctx } });
  } catch (err) {
    // Auditing must never break the user-facing action, but failures must be visible.
    console.error("Failed to write audit log", entry.action, err);
  }
}

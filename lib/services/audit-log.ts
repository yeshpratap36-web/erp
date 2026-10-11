import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { parseDateKey } from "@/lib/time";

/** Audit-log filters from the query string (all optional, tolerant of junk). */
export const auditFilterSchema = z.object({
  action: z.string().trim().max(60).optional().catch(undefined),
  actor: z.string().trim().max(60).optional().catch(undefined),
  entityType: z.string().trim().max(40).optional().catch(undefined),
  entityId: z.string().trim().max(120).optional().catch(undefined),
  from: z.string().trim().max(10).optional().catch(undefined),
  to: z.string().trim().max(10).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});
export type AuditFilter = z.output<typeof auditFilterSchema>;

function whereFor(f: AuditFilter): Prisma.AuditLogWhereInput {
  const from = f.from ? parseDateKey(f.from) : null;
  const to = f.to ? parseDateKey(f.to) : null;
  return {
    ...(f.action ? { action: f.action } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.entityId ? { entityId: { contains: f.entityId } } : {}),
    ...(f.actor
      ? {
          actor: {
            OR: [
              { loginId: { equals: f.actor, mode: "insensitive" } },
              { name: { contains: f.actor, mode: "insensitive" } },
            ],
          },
        }
      : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lt: new Date(to.getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
  };
}

export async function queryAuditLog(
  f: AuditFilter,
  { skip, take }: { skip: number; take: number },
) {
  const where = whereFor(f);
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { actor: { select: { loginId: true, name: true, role: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return { rows, total };
}

/** Distinct values for the filter dropdowns. */
export async function auditFacets() {
  const [actions, entityTypes] = await Promise.all([
    db.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    db.auditLog.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);
  return {
    actions: actions.map((a) => a.action),
    entityTypes: entityTypes.map((e) => e.entityType),
  };
}

export const AUDIT_EXPORT_LIMIT = 10_000;

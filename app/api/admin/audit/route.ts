import { apiRoute } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { AUDIT_EXPORT_LIMIT, auditFilterSchema, queryAuditLog } from "@/lib/services/audit-log";

/** GET — audit log entries matching the same filters as the viewer, as CSV (newest first). */
export const GET = apiRoute(
  { permission: "audit:read", input: auditFilterSchema },
  async ({ input }) => {
    const { rows } = await queryAuditLog(input, { skip: 0, take: AUDIT_EXPORT_LIMIT });
    const csv = toCsv(
      rows.map((r) => ({
        time: r.createdAt.toISOString(),
        action: r.action,
        actor_login: r.actor?.loginId ?? "",
        actor_name: r.actor?.name ?? "",
        entity_type: r.entityType,
        entity_id: r.entityId ?? "",
        ip: r.ipAddress ?? "",
        details: r.metadata ? JSON.stringify(r.metadata) : "",
      })),
      ["time", "action", "actor_login", "actor_name", "entity_type", "entity_id", "ip", "details"],
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="audit-log.csv"',
        "Cache-Control": "no-store",
      },
    });
  },
);

import type { Metadata } from "next";
import { Pagination } from "@/components/admin/list-controls";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { auditFacets, auditFilterSchema, queryAuditLog } from "@/lib/services/audit-log";
import { PAGE_SIZE } from "@/lib/validators/common";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePermission("audit:read");
  const filter = auditFilterSchema.parse(await searchParams);
  const [{ rows, total }, facets] = await Promise.all([
    queryAuditLog(filter, { skip: (filter.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    auditFacets(),
  ]);
  const { page: _page, ...params } = filter;
  const exportQuery = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  ).toString();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Every sensitive action. Entries can't be edited or deleted."
        actions={
          <a
            href={`/api/admin/audit?${exportQuery}`}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            download
          >
            Export CSV
          </a>
        }
      />
      <form method="get" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <NativeSelect
          name="action"
          defaultValue={filter.action ?? ""}
          aria-label="Action"
          className="w-full"
        >
          <NativeSelectOption value="">All actions</NativeSelectOption>
          {facets.actions.map((a) => (
            <NativeSelectOption key={a} value={a}>
              {a}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          name="entityType"
          defaultValue={filter.entityType ?? ""}
          aria-label="Record type"
          className="w-full"
        >
          <NativeSelectOption value="">All record types</NativeSelectOption>
          {facets.entityTypes.map((t) => (
            <NativeSelectOption key={t} value={t}>
              {t}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          name="actor"
          defaultValue={filter.actor}
          placeholder="Who (login ID or name)"
          aria-label="Who"
        />
        <Input name="from" type="date" defaultValue={filter.from} aria-label="From date" />
        <Input name="to" type="date" defaultValue={filter.to} aria-label="To date" />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No matching entries.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="p-3" data-testid="audit-row">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-40 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(r.createdAt)}
                  </span>
                  <code className="text-xs font-medium">{r.action}</code>
                  <span className="text-muted-foreground">
                    {r.actor ? `${r.actor.name} (${r.actor.loginId})` : "System"} · {r.entityType}
                    {r.entityId ? ` ${r.entityId.slice(0, 40)}` : ""}
                  </span>
                </summary>
                <dl className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-[8rem_1fr]">
                  <dt>IP address</dt>
                  <dd>{r.ipAddress ?? "—"}</dd>
                  <dt>Browser</dt>
                  <dd className="break-all">{r.userAgent ?? "—"}</dd>
                  <dt>Record</dt>
                  <dd className="break-all">{r.entityId ?? "—"}</dd>
                  <dt>Details</dt>
                  <dd>
                    <pre className="overflow-x-auto rounded bg-muted p-2 text-[11px]">
                      {r.metadata ? JSON.stringify(r.metadata, null, 2) : "—"}
                    </pre>
                  </dd>
                </dl>
              </details>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={filter.page} total={total} params={params} />
    </div>
  );
}

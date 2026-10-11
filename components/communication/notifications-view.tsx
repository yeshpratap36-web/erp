import { openNotificationAction, markAllReadAction } from "@/app/actions/communication";
import { Pagination } from "@/components/admin/list-controls";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmAction } from "@/components/forms/confirm-action";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { listNotifications } from "@/lib/services/notifications";
import { cn } from "@/lib/utils";
import { PAGE_SIZE } from "@/lib/validators/common";

export async function NotificationsView({ user, page }: { user: CurrentUser; page: number }) {
  const { rows, total } = await listNotifications(user.id, {
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const unread = rows.some((n) => !n.readAt);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        actions={
          unread && <ConfirmAction action={markAllReadAction} fields={{}} label="Mark all read" />
        }
      />
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          You&apos;re all caught up.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((n) => (
            <li
              key={n.id}
              className={cn("flex flex-wrap items-start gap-3 p-3", !n.readAt && "bg-primary/5")}
              data-testid="notification"
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  n.readAt ? "bg-transparent" : "bg-primary",
                )}
                aria-label={n.readAt ? undefined : "Unread"}
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className={cn("text-sm", !n.readAt && "font-medium")}>{n.title}</div>
                {n.body && <div className="text-sm text-muted-foreground">{n.body}</div>}
                <div className="text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</div>
              </div>
              {n.link && (
                <ConfirmAction action={openNotificationAction} fields={{ id: n.id }} label="Open" />
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} total={total} params={{}} />
    </div>
  );
}

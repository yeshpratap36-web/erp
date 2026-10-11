import type { Metadata } from "next";
import { NotificationsView } from "@/components/communication/notifications-view";
import { requireRole } from "@/lib/auth/session";
import { listQuerySchema } from "@/lib/validators/common";

export const metadata: Metadata = { title: "Notifications" };

export default async function AdminNotificationsPage({
  searchParams,
}: PageProps<"/admin/notifications">) {
  const user = await requireRole("SUPER_ADMIN");
  const { page } = listQuerySchema.parse(await searchParams);
  return <NotificationsView user={user} page={page} />;
}

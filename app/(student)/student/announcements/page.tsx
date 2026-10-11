import type { Metadata } from "next";
import { AnnouncementsView } from "@/components/communication/announcements-view";
import { requireRole } from "@/lib/auth/session";
import { listQuerySchema } from "@/lib/validators/common";

export const metadata: Metadata = { title: "Announcements" };

export default async function StudentAnnouncementsPage({
  searchParams,
}: PageProps<"/student/announcements">) {
  const user = await requireRole("STUDENT");
  const { page } = listQuerySchema.parse(await searchParams);
  return <AnnouncementsView user={user} page={page} />;
}

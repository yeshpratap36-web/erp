import type { Metadata } from "next";
import { RequestsReviewView } from "@/components/communication/requests-review-view";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Requests" };

export default async function AdminRequestsPage() {
  const user = await requireRole("SUPER_ADMIN");
  return <RequestsReviewView user={user} />;
}

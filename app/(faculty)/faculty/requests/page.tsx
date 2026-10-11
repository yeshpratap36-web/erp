import type { Metadata } from "next";
import { RequestsReviewView } from "@/components/communication/requests-review-view";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Requests" };

export default async function FacultyRequestsPage() {
  const user = await requireRole("FACULTY");
  return <RequestsReviewView user={user} />;
}

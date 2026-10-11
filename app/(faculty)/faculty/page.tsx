import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Faculty dashboard" };

// Placeholder — dashboards are built in Phase 4.
export default async function FacultyDashboardPage() {
  const user = await requireRole("FACULTY");
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <p className="text-sm text-muted-foreground">Signed in as {user.loginId}.</p>
    </div>
  );
}

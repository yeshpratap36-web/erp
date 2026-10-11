import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/session";

/**
 * Layer 2 guard for a whole route group. Children are not rendered (and their data not
 * fetched) unless the fresh DB user is onboarded and has one of `roles`.
 * Must be rendered inside <Suspense> because it reads the session.
 */
export async function RoleGate({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  await requireRole(...roles);
  return children;
}

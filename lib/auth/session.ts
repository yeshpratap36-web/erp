import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { can, ROLE_HOME, type Action } from "@/lib/permissions";
import { LOGIN_PATH, LOGOUT_PATH, requiredOnboardingPath } from "@/lib/auth/routing";

const currentUserSelect = {
  id: true,
  loginId: true,
  email: true,
  name: true,
  role: true,
  mustChangePassword: true,
  onboardingStep: true,
  isActive: true,
  deletedAt: true,
  sessionVersion: true,
  studentProfile: { select: { id: true, sectionId: true, faceReenrollAllowed: true } },
  facultyProfile: { select: { id: true, departmentId: true } },
} as const;

/**
 * The authenticated user, freshly loaded from the DB. This is the authoritative check:
 * the JWT is only trusted for its user id, and the session is rejected if the account
 * was deactivated or its sessionVersion was bumped (password reset, role change…).
 * Memoized per request with React cache().
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return { status: "anonymous" as const };

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: currentUserSelect,
  });
  if (
    !user ||
    !user.isActive ||
    user.deletedAt ||
    user.sessionVersion !== session.user.sessionVersion
  ) {
    return { status: "stale" as const };
  }

  const { isActive: _a, deletedAt: _d, sessionVersion: _v, ...safe } = user;
  return { status: "authenticated" as const, user: safe };
});

export type CurrentUser = Extract<
  Awaited<ReturnType<typeof getCurrentUser>>,
  { status: "authenticated" }
>["user"];

/** Any signed-in user, regardless of onboarding state (used by the onboarding pages). */
export async function requireSession(): Promise<CurrentUser> {
  const result = await getCurrentUser();
  if (result.status === "anonymous") redirect(LOGIN_PATH);
  if (result.status === "stale") redirect(LOGOUT_PATH);
  return result.user;
}

/** A fully onboarded user with one of the given roles. Redirects otherwise. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireSession();
  const gate = requiredOnboardingPath(user);
  if (gate) redirect(gate);
  if (!roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}

/** A fully onboarded user allowed to perform `action`. Redirects otherwise. */
export async function requirePermission(action: Action): Promise<CurrentUser> {
  const user = await requireSession();
  const gate = requiredOnboardingPath(user);
  if (gate) redirect(gate);
  if (!can(user, action)) redirect(ROLE_HOME[user.role]);
  return user;
}

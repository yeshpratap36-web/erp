import { redirect } from "next/navigation";
import { homePathFor, requiredOnboardingPath } from "@/lib/auth/routing";
import { requireSession, type CurrentUser } from "@/lib/auth/session";

/**
 * Server-side guard for an onboarding page: renders only when `path` is exactly the
 * user's pending step; otherwise sends them where they should be.
 */
export async function OnboardingGate({
  path,
  children,
}: {
  path: string;
  children: (user: CurrentUser) => React.ReactNode;
}) {
  const user = await requireSession();
  if (requiredOnboardingPath(user) !== path) redirect(homePathFor(user));
  return children(user);
}

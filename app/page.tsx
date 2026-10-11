import { redirect } from "next/navigation";
import { Suspense } from "react";
import { homePathFor, LOGIN_PATH, LOGOUT_PATH } from "@/lib/auth/routing";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * "/" routes the user to their pending onboarding step or role home. proxy.ts usually does
 * this first, but a Server Action redirect (e.g. after sign-in) renders the target in the
 * same response without passing through the proxy, so the page must decide on its own.
 */
export default function Home() {
  return (
    <Suspense>
      <RedirectHome />
    </Suspense>
  );
}

async function RedirectHome(): Promise<never> {
  const session = await getCurrentUser();
  if (session.status === "anonymous") redirect(LOGIN_PATH);
  if (session.status === "stale") redirect(LOGOUT_PATH);
  redirect(homePathFor(session.user));
}

import { signOut } from "@/auth";

/**
 * Clears the session cookie and returns to /login. Used when a JWT is still valid but no
 * longer matches the DB (deactivated account, password reset), which would otherwise loop
 * between proxy.ts and the server-side checks. Regular sign-out uses signOutAction (POST).
 */
export async function GET() {
  await signOut({ redirectTo: "/login" });
}

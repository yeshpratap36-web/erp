import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { decideRoute } from "@/lib/auth/routing";

/**
 * Layer 1 of 3 (route protection). Fast, DB-free decision based on the JWT claims.
 * Layer 2 (server checks in layouts/actions/API via lib/auth/session.ts) and layer 3
 * (scoped DB queries via lib/auth/scope.ts) are authoritative — never rely on this alone.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const user = req.auth?.user ?? null;
  const decision = decideRoute(req.nextUrl.pathname, user);

  switch (decision.type) {
    case "allow":
      return NextResponse.next();
    case "redirect":
      return NextResponse.redirect(new URL(decision.to, req.nextUrl));
    case "deny":
      return NextResponse.json({ ok: false, error: decision.error }, { status: decision.status });
  }
});

export const config = {
  // Everything except static assets and Next.js internals.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

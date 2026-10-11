/**
 * Pure routing rules shared by proxy.ts (fast check on the JWT) and server layouts
 * (authoritative check on the fresh DB user). Keeping one implementation means the
 * two layers can't drift apart.
 */
import type { OnboardingStep, Role } from "@/generated/prisma/enums";
import { ROLE_HOME } from "@/lib/permissions";

export type RoutingUser = {
  role: Role;
  mustChangePassword: boolean;
  onboardingStep: OnboardingStep;
};

export const LOGIN_PATH = "/login";
/** Clears the session cookie; must stay reachable in every state to break redirect loops. */
export const LOGOUT_PATH = "/logout";
export const CHANGE_PASSWORD_PATH = "/change-password";
export const CONSENT_PATH = "/onboarding/consent";
export const FACE_ENROLLMENT_PATH = "/onboarding/face";
/** API routes the onboarding pages call (Phase 5: consent + face upload). */
const ONBOARDING_API_PREFIX = "/api/onboarding";

const ROLE_PREFIXES: { prefix: string; role: Role }[] = [
  { prefix: "/admin", role: "SUPER_ADMIN" },
  { prefix: "/faculty", role: "FACULTY" },
  { prefix: "/student", role: "STUDENT" },
  { prefix: "/api/admin", role: "SUPER_ADMIN" },
  { prefix: "/api/faculty", role: "FACULTY" },
  { prefix: "/api/student", role: "STUDENT" },
];

export type RouteDecision =
  | { type: "allow" }
  | { type: "redirect"; to: string }
  | { type: "deny"; status: 401 | 403; error: string };

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * The page a user must complete before anything else, or null when fully onboarded.
 * Password change applies to every role; consent + face enrollment only to students.
 */
export function requiredOnboardingPath(user: RoutingUser): string | null {
  if (user.mustChangePassword) return CHANGE_PASSWORD_PATH;
  if (user.role !== "STUDENT") return null;
  switch (user.onboardingStep) {
    case "COMPLETE":
      return null;
    case "FACE_ENROLLMENT":
      return FACE_ENROLLMENT_PATH;
    // CHANGE_PASSWORD with mustChangePassword=false means the password step is done.
    case "CHANGE_PASSWORD":
    case "BIOMETRIC_CONSENT":
      return CONSENT_PATH;
  }
}

/** Where a user lands after login: their pending onboarding step, else their role's home. */
export function homePathFor(user: RoutingUser): string {
  return requiredOnboardingPath(user) ?? ROLE_HOME[user.role];
}

/** Only allow same-origin relative paths as post-login redirects (prevents open redirects). */
export function safeCallbackPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}

export function decideRoute(pathname: string, user: RoutingUser | null): RouteDecision {
  if (matchesPrefix(pathname, "/api/auth") || pathname === LOGOUT_PATH) return { type: "allow" };

  const isApi = matchesPrefix(pathname, "/api");
  const isLogin = pathname === LOGIN_PATH;

  if (!user) {
    if (isLogin) return { type: "allow" };
    if (isApi) return { type: "deny", status: 401, error: "unauthenticated" };
    const callback = pathname === "/" ? "" : `?callbackUrl=${encodeURIComponent(pathname)}`;
    return { type: "redirect", to: `${LOGIN_PATH}${callback}` };
  }

  const gate = requiredOnboardingPath(user);
  if (gate) {
    if (pathname === gate) return { type: "allow" };
    if (gate !== CHANGE_PASSWORD_PATH && matchesPrefix(pathname, ONBOARDING_API_PREFIX)) {
      return { type: "allow" };
    }
    if (isApi) return { type: "deny", status: 403, error: "onboarding_required" };
    return { type: "redirect", to: gate };
  }

  // Fully onboarded from here on.
  if (pathname === "/" || isLogin || matchesPrefix(pathname, "/onboarding")) {
    return { type: "redirect", to: ROLE_HOME[user.role] };
  }

  const scoped = ROLE_PREFIXES.find((r) => matchesPrefix(pathname, r.prefix));
  if (scoped && scoped.role !== user.role) {
    if (isApi) return { type: "deny", status: 403, error: "forbidden" };
    return { type: "redirect", to: ROLE_HOME[user.role] };
  }

  return { type: "allow" };
}

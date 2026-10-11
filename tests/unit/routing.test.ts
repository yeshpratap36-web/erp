import { describe, expect, it } from "vitest";
import {
  decideRoute,
  homePathFor,
  requiredOnboardingPath,
  safeCallbackPath,
  type RoutingUser,
} from "@/lib/auth/routing";

const onboarded = (role: RoutingUser["role"]): RoutingUser => ({
  role,
  mustChangePassword: false,
  onboardingStep: "COMPLETE",
});
const newStudent: RoutingUser = {
  role: "STUDENT",
  mustChangePassword: true,
  onboardingStep: "CHANGE_PASSWORD",
};

describe("requiredOnboardingPath", () => {
  it("forces password change for every role first", () => {
    expect(requiredOnboardingPath(newStudent)).toBe("/change-password");
    expect(requiredOnboardingPath({ ...onboarded("SUPER_ADMIN"), mustChangePassword: true })).toBe(
      "/change-password",
    );
  });

  it("walks students through consent then face enrollment", () => {
    const s = { ...newStudent, mustChangePassword: false };
    expect(requiredOnboardingPath({ ...s, onboardingStep: "BIOMETRIC_CONSENT" })).toBe(
      "/onboarding/consent",
    );
    expect(requiredOnboardingPath({ ...s, onboardingStep: "FACE_ENROLLMENT" })).toBe(
      "/onboarding/face",
    );
    expect(requiredOnboardingPath({ ...s, onboardingStep: "COMPLETE" })).toBeNull();
  });

  it("never sends faculty/admin to biometric steps", () => {
    expect(
      requiredOnboardingPath({ ...onboarded("FACULTY"), onboardingStep: "BIOMETRIC_CONSENT" }),
    ).toBeNull();
  });

  it("re-forces a password change after an admin reset without redoing face enrollment", () => {
    const reset = { ...onboarded("STUDENT"), mustChangePassword: true };
    expect(requiredOnboardingPath(reset)).toBe("/change-password");
  });
});

describe("decideRoute — anonymous", () => {
  it("allows /login and Auth.js endpoints", () => {
    expect(decideRoute("/login", null)).toEqual({ type: "allow" });
    expect(decideRoute("/api/auth/session", null)).toEqual({ type: "allow" });
  });

  it("redirects pages to /login with a callback", () => {
    expect(decideRoute("/student", null)).toEqual({
      type: "redirect",
      to: "/login?callbackUrl=%2Fstudent",
    });
    expect(decideRoute("/", null)).toEqual({ type: "redirect", to: "/login" });
  });

  it("leaves the health check public", () => {
    expect(decideRoute("/api/health", null)).toEqual({ type: "allow" });
  });

  it("returns 401 for APIs", () => {
    expect(decideRoute("/api/me", null)).toMatchObject({ type: "deny", status: 401 });
  });
});

describe("decideRoute — onboarding", () => {
  it("blocks every other page and API until the pending step is done", () => {
    expect(decideRoute("/student", newStudent)).toEqual({
      type: "redirect",
      to: "/change-password",
    });
    expect(decideRoute("/onboarding/face", newStudent)).toEqual({
      type: "redirect",
      to: "/change-password",
    });
    expect(decideRoute("/api/me", newStudent)).toMatchObject({ type: "deny", status: 403 });
    expect(decideRoute("/change-password", newStudent)).toEqual({ type: "allow" });
  });

  it("allows onboarding APIs only during consent/face steps", () => {
    const consenting = {
      ...newStudent,
      mustChangePassword: false,
      onboardingStep: "BIOMETRIC_CONSENT" as const,
    };
    expect(decideRoute("/api/onboarding/consent", consenting)).toEqual({ type: "allow" });
    expect(decideRoute("/api/onboarding/consent", newStudent)).toMatchObject({ type: "deny" });
  });

  it("always lets a session reach /logout", () => {
    expect(decideRoute("/logout", newStudent)).toEqual({ type: "allow" });
  });
});

describe("decideRoute — role areas", () => {
  it("keeps each role inside its own area", () => {
    expect(decideRoute("/admin/users", onboarded("STUDENT"))).toEqual({
      type: "redirect",
      to: "/student",
    });
    expect(decideRoute("/student", onboarded("FACULTY"))).toEqual({
      type: "redirect",
      to: "/faculty",
    });
    expect(decideRoute("/api/admin/users", onboarded("FACULTY"))).toMatchObject({
      type: "deny",
      status: 403,
    });
    expect(decideRoute("/admin/users", onboarded("SUPER_ADMIN"))).toEqual({ type: "allow" });
  });

  it("does not treat look-alike prefixes as role areas", () => {
    expect(decideRoute("/administrator", onboarded("STUDENT"))).toEqual({ type: "allow" });
  });

  it("sends onboarded users away from /login, / and onboarding pages", () => {
    expect(decideRoute("/login", onboarded("FACULTY"))).toEqual({
      type: "redirect",
      to: "/faculty",
    });
    expect(decideRoute("/", onboarded("SUPER_ADMIN"))).toEqual({ type: "redirect", to: "/admin" });
    expect(decideRoute("/onboarding/consent", onboarded("STUDENT"))).toEqual({
      type: "redirect",
      to: "/student",
    });
  });

  it("lets onboarded users change their password voluntarily", () => {
    expect(decideRoute("/change-password", onboarded("STUDENT"))).toEqual({ type: "allow" });
  });
});

describe("homePathFor / safeCallbackPath", () => {
  it("prefers the pending onboarding step over the role home", () => {
    expect(homePathFor(newStudent)).toBe("/change-password");
    expect(homePathFor(onboarded("FACULTY"))).toBe("/faculty");
  });

  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null])(
    "rejects unsafe callback %s",
    (value) => expect(safeCallbackPath(value)).toBeNull(),
  );

  it("accepts same-origin paths", () => {
    expect(safeCallbackPath("/student/attendance?x=1")).toBe("/student/attendance?x=1");
  });
});

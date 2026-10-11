"use server";

import { redirect } from "next/navigation";
import { AuthError, CredentialsSignin } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import type { ActionState } from "@/lib/actions";
import { audit } from "@/lib/audit";
import { findUserByIdentifier } from "@/lib/auth/login";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { decideRoute, homePathFor, LOGIN_PATH, safeCallbackPath } from "@/lib/auth/routing";
import { requireSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { changePasswordSchema, loginSchema } from "@/lib/validators/auth";

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: "Incorrect login ID or password.",
  locked:
    "Too many failed attempts. Your account is temporarily locked — try again later or contact the administrator.",
  rate_limited: "Too many sign-in attempts. Please wait a few minutes and try again.",
};

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  const values = { identifier: formData.get("identifier")?.toString() ?? "" };
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  try {
    await signIn("credentials", { ...parsed.data, redirect: false });
  } catch (err) {
    if (err instanceof CredentialsSignin) {
      return { error: LOGIN_ERRORS[err.code] ?? LOGIN_ERRORS.invalid_credentials, values };
    }
    if (err instanceof AuthError) return { error: "Sign-in failed. Please try again.", values };
    throw err;
  }

  // Redirect straight to the final destination: a Server Action redirect renders the target
  // without passing through proxy.ts, so a second server-side redirect would leave the
  // browser showing the wrong URL.
  const user = await findUserByIdentifier(parsed.data.identifier);
  if (!user) redirect(LOGIN_PATH);
  const callback = safeCallbackPath(formData.get("callbackUrl")?.toString());
  const destination =
    callback && decideRoute(callback, user).type === "allow" ? callback : homePathFor(user);
  redirect(destination);
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sessionUser = await requireSession();

  const limit = await rateLimit(`password-change:${sessionUser.id}`, 10, 15 * 60);
  if (!limit.allowed) return { error: "Too many attempts. Please wait a few minutes." };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { currentPassword, newPassword } = parsed.data;

  const record = await db.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { passwordHash: true, loginId: true, role: true, onboardingStep: true },
  });

  if (!(await verifyPassword(record.passwordHash, currentPassword))) {
    return { fieldErrors: { currentPassword: ["Current password is incorrect"] } };
  }
  if (newPassword.toLowerCase().includes(record.loginId.toLowerCase())) {
    return { fieldErrors: { newPassword: ["Password must not contain your login ID"] } };
  }

  const nextStep =
    record.onboardingStep === "CHANGE_PASSWORD"
      ? record.role === "STUDENT"
        ? "BIOMETRIC_CONSENT"
        : "COMPLETE"
      : record.onboardingStep;

  // Bumping sessionVersion signs out every other session (e.g. anyone who saw the temp password).
  const updated = await db.user.update({
    where: { id: sessionUser.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      onboardingStep: nextStep,
      sessionVersion: { increment: 1 },
    },
    select: { role: true, mustChangePassword: true, onboardingStep: true },
  });

  await audit({
    actorId: sessionUser.id,
    action: "auth.password_changed",
    entityType: "User",
    entityId: sessionUser.id,
    metadata: { forced: sessionUser.mustChangePassword },
  });

  // Re-authenticate this browser with the new password to get a token carrying the new sessionVersion.
  await signIn("credentials", {
    identifier: record.loginId,
    password: newPassword,
    redirectTo: homePathFor(updated),
  });
  return { ok: true };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

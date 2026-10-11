import "server-only";
import type { z } from "zod";
import type { OnboardingStep, Role } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { loginSchema } from "@/lib/validators/auth";
import { getSetting } from "@/lib/settings.server";

export type LoginFailure = "invalid_credentials" | "locked" | "rate_limited";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  onboardingStep: OnboardingStep;
  sessionVersion: number;
};

type LoginResult = { ok: true; user: AuthenticatedUser } | { ok: false; reason: LoginFailure };

const IP_LIMIT = { limit: 30, windowSeconds: 15 * 60 };
const IDENTIFIER_LIMIT = { limit: 10, windowSeconds: 15 * 60 };

// Verified against when the account doesn't exist, so response time doesn't reveal
// whether an identifier is registered.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("dummy-password-for-timing"));

/** Look up a user by college email or login ID (case-insensitive, since roll numbers get typed in lowercase). */
export function findUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  return db.user.findFirst({
    where: {
      OR: [{ email: trimmed.toLowerCase() }, { loginId: { equals: trimmed, mode: "insensitive" } }],
    },
  });
}

export async function authenticate(
  input: z.infer<typeof loginSchema>,
  context: { ipAddress: string | null; userAgent: string | null },
): Promise<LoginResult> {
  const identifier = input.identifier.toLowerCase();

  const [ipCheck, idCheck] = await Promise.all([
    context.ipAddress
      ? rateLimit(`login:ip:${context.ipAddress}`, IP_LIMIT.limit, IP_LIMIT.windowSeconds)
      : null,
    rateLimit(`login:id:${identifier}`, IDENTIFIER_LIMIT.limit, IDENTIFIER_LIMIT.windowSeconds),
  ]);
  if ((ipCheck && !ipCheck.allowed) || !idCheck.allowed) {
    return { ok: false, reason: "rate_limited" };
  }

  const user = await findUserByIdentifier(input.identifier);

  if (!user) {
    await verifyPassword(await getDummyHash(), input.password);
    return { ok: false, reason: "invalid_credentials" };
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, reason: "locked" };
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);

  // Deactivated / deleted accounts get the same generic error as a wrong password.
  if (!user.isActive || user.deletedAt) {
    return { ok: false, reason: "invalid_credentials" };
  }

  if (!passwordOk) {
    const [maxAttempts, lockoutMinutes] = await Promise.all([
      getSetting("auth.maxFailedAttempts"),
      getSetting("auth.lockoutMinutes"),
    ]);
    // Atomic increment so concurrent attempts can't under-count.
    const { failedLoginAttempts: attempts } = await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    const shouldLock = attempts >= maxAttempts;
    if (shouldLock) {
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: new Date(now.getTime() + lockoutMinutes * 60_000),
        },
      });
    }
    await audit({
      actorId: user.id,
      action: shouldLock ? "auth.account_locked" : "auth.login_failed",
      entityType: "User",
      entityId: user.id,
      metadata: shouldLock ? { lockoutMinutes } : { attempts },
      context,
    });
    return { ok: false, reason: shouldLock ? "locked" : "invalid_credentials" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
  });
  await audit({
    actorId: user.id,
    action: "auth.login_succeeded",
    entityType: "User",
    entityId: user.id,
    context,
  });

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      onboardingStep: user.onboardingStep,
      sessionVersion: user.sessionVersion,
    },
  };
}

import "server-only";
import type { z } from "zod";
import type { OnboardingStep, Role } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { rateLimit, rateLimitReached } from "@/lib/rate-limit";
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

/**
 * Only *failed* attempts count. Many students sign in from one campus IP (NAT), so the
 * per-IP limit is generous and only slows password guessing from a single network;
 * per-account protection comes from the identifier limit and the account lockout.
 */
const IP_FAILURE_LIMIT = { limit: 100, windowSeconds: 15 * 60 };
const IDENTIFIER_FAILURE_LIMIT = { limit: 10, windowSeconds: 15 * 60 };

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

  const ipKey = context.ipAddress ? `login:ip:${context.ipAddress}` : null;
  const idKey = `login:id:${identifier}`;
  const [ipBlocked, idBlocked] = await Promise.all([
    ipKey ? rateLimitReached(ipKey, IP_FAILURE_LIMIT.limit) : false,
    rateLimitReached(idKey, IDENTIFIER_FAILURE_LIMIT.limit),
  ]);
  if (ipBlocked || idBlocked) return { ok: false, reason: "rate_limited" };
  const recordFailure = () =>
    Promise.all([
      ipKey ? rateLimit(ipKey, IP_FAILURE_LIMIT.limit, IP_FAILURE_LIMIT.windowSeconds) : null,
      rateLimit(idKey, IDENTIFIER_FAILURE_LIMIT.limit, IDENTIFIER_FAILURE_LIMIT.windowSeconds),
    ]);

  const user = await findUserByIdentifier(input.identifier);

  if (!user) {
    await verifyPassword(await getDummyHash(), input.password);
    await recordFailure();
    return { ok: false, reason: "invalid_credentials" };
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    return { ok: false, reason: "locked" };
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);

  // Deactivated / deleted accounts get the same generic error as a wrong password.
  if (!user.isActive || user.deletedAt) {
    await recordFailure();
    return { ok: false, reason: "invalid_credentials" };
  }

  if (!passwordOk) {
    await recordFailure();
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

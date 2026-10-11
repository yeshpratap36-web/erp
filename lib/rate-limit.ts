import "server-only";
import { db } from "@/lib/db";

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

/**
 * Fixed-window counter stored in Postgres, so limits hold across multiple app instances.
 * One atomic upsert per call: increments the window, or starts a new one if it expired.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const [row] = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}), now())
    ON CONFLICT ("key") DO UPDATE SET
      "count"     = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt"   = CASE WHEN "RateLimitBucket"."resetAt" <= now()
                         THEN now() + make_interval(secs => ${windowSeconds})
                         ELSE "RateLimitBucket"."resetAt" END,
      "updatedAt" = now()
    RETURNING "count", "resetAt"`;
  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    resetAt: row.resetAt,
  };
}

/** Read a counter without incrementing it (e.g. to count only failures). */
export async function rateLimitReached(key: string, limit: number): Promise<boolean> {
  const row = await db.rateLimitBucket.findUnique({
    where: { key },
    select: { count: true, resetAt: true },
  });
  return !!row && row.resetAt > new Date() && row.count >= limit;
}

import { connection } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * GET /api/health — public readiness check for load balancers / uptime monitors.
 * Reports only up/down per dependency (no versions, hosts or errors).
 */
export async function GET() {
  await connection(); // always evaluate at request time
  const [database, face] = await Promise.all([
    db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    fetch(`${env.FACE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) })
      .then((r) => r.ok)
      .catch(() => false),
  ]);
  // The app can run (with manual attendance) without the face service, so it's reported
  // but doesn't fail readiness.
  return Response.json(
    { ok: database, database, faceService: face },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

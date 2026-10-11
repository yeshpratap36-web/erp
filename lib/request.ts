import "server-only";
import { headers } from "next/headers";

/**
 * Client IP as reported by the reverse proxy. Only trustworthy when the app is
 * deployed behind a proxy that overwrites X-Forwarded-For (Vercel, Cloudflare, nginx).
 */
export function clientIpFrom(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return h.get("x-real-ip");
}

export async function requestContext() {
  const h = await headers();
  return { ipAddress: clientIpFrom(h), userAgent: h.get("user-agent")?.slice(0, 512) ?? null };
}

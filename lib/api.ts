import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { requiredOnboardingPath } from "@/lib/auth/routing";
import { HttpError } from "@/lib/errors";
import { can, type Action } from "@/lib/permissions";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: string; message?: string; issues?: unknown };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

function fail(status: number, error: string, message?: string, issues?: unknown) {
  return NextResponse.json<ApiFailure>({ ok: false, error, message, issues }, { status });
}

type HandlerContext<I, P> = { user: CurrentUser; input: I; params: P; req: NextRequest };

/**
 * Wraps a Route Handler with the standard pipeline:
 *   authenticate → authorize (permission) → validate (Zod) → act → typed JSON response.
 * Row-level checks (assertSectionAccess etc.) still belong inside the handler.
 *
 * `input` is read from the JSON body for POST/PUT/PATCH/DELETE and from the query string for GET.
 */
export function apiRoute<I = undefined, O = unknown, P = Record<string, string>>(
  options: {
    permission?: Action;
    input?: z.ZodType<I>;
    /** Allow users who haven't finished onboarding (only for onboarding endpoints). */
    allowDuringOnboarding?: boolean;
  },
  handler: (ctx: HandlerContext<I, P>) => Promise<O>,
) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    try {
      const session = await getCurrentUser();
      if (session.status !== "authenticated") return fail(401, "unauthenticated");
      const { user } = session;
      if (!options.allowDuringOnboarding && requiredOnboardingPath(user)) {
        return fail(403, "onboarding_required");
      }
      if (options.permission && !can(user, options.permission)) return fail(403, "forbidden");

      let input = undefined as I;
      if (options.input) {
        const raw =
          req.method === "GET" || req.method === "HEAD"
            ? Object.fromEntries(req.nextUrl.searchParams)
            : await req.json().catch(() => undefined);
        const parsed = options.input.safeParse(raw);
        if (!parsed.success) {
          return fail(400, "invalid_input", "Invalid request", z.flattenError(parsed.error));
        }
        input = parsed.data;
      }

      const data = await handler({ user, input, params: await segment.params, req });
      return NextResponse.json<ApiSuccess<O>>({ ok: true, data });
    } catch (err) {
      // Let Next.js internals through (prerender bail-out on headers(), redirect(), notFound()).
      unstable_rethrow(err);
      if (err instanceof HttpError) return fail(err.status, err.code, err.message);
      console.error(`API error ${req.method} ${req.nextUrl.pathname}`, err);
      return fail(500, "internal_error", "Something went wrong");
    }
  };
}

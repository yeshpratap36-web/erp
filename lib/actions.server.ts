import "server-only";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { ActionState } from "@/lib/actions";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { FieldValidationError, HttpError } from "@/lib/errors";
import type { Action } from "@/lib/permissions";

/** FormData → plain object (drops Next.js internal $ACTION_* fields; keeps the last value per key). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION") || typeof value !== "string") continue;
    out[key] = value;
  }
  return out;
}

/** Maps known Prisma errors to user-facing messages. Returns null for unknown errors. */
export function prismaErrorToState(err: unknown, uniqueField?: string): ActionState<never> | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (err.code === "P2002") {
    const message = "A record with this value already exists";
    return uniqueField ? { fieldErrors: { [uniqueField]: [message] } } : { error: message };
  }
  if (err.code === "P2003") {
    return { error: "This record is still in use by other records and can't be removed." };
  }
  if (err.code === "P2025") return { error: "This record no longer exists." };
  return null;
}

type Handler<S extends z.ZodType, T> = (
  input: z.output<S>,
  user: CurrentUser,
) => Promise<ActionState<T> | void>;

/**
 * Standard pipeline for form Server Actions:
 *   authenticate + authorize (permission) → validate (Zod) → act → refresh the page.
 * Known Prisma/HTTP errors become form errors; redirect()/notFound() pass through.
 */
export function formAction<S extends z.ZodType, T = undefined>(
  options: {
    permission: Action;
    schema: S;
    uniqueField?: string;
    sensitiveFields?: readonly string[];
  },
  handler: Handler<S, T>,
) {
  return async (_prev: ActionState<T>, formData: FormData): Promise<ActionState<T>> => {
    const user = await requirePermission(options.permission);
    const raw = formDataToObject(formData);
    const values = Object.fromEntries(
      Object.entries(raw).filter(([k]) => !options.sensitiveFields?.includes(k)),
    );

    const parsed = options.schema.safeParse(raw);
    if (!parsed.success) {
      return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
    }

    try {
      const result = (await handler(parsed.data, user)) ?? { ok: true };
      refresh();
      return result;
    } catch (err) {
      unstable_rethrow(err);
      if (err instanceof FieldValidationError) return { fieldErrors: err.fieldErrors, values };
      if (err instanceof HttpError) return { error: err.message, values };
      const mapped = prismaErrorToState(err, options.uniqueField);
      if (mapped) return { ...mapped, values };
      console.error("Server action failed", err);
      return { error: "Something went wrong. Please try again.", values };
    }
  };
}

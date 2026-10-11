import { z } from "zod";

/** Trimmed required string. */
export const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

/** Trimmed optional string; empty input becomes null (clears the DB column). */
export const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/** Short uppercase code such as "CSE" or "CS301". */
export const codeField = (label = "Code") =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _")
    .transform((v) => v.toUpperCase());

export const idField = (label = "Selection") => z.string().trim().min(1, `${label} is required`);

/** Optional id from a <select>; "" → null. */
export const optionalId = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null));

export const intField = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

/** <input type="date"> value → Date at UTC midnight (matches @db.Date). */
export const dateField = (label: string) =>
  z.iso.date(`${label} must be a valid date`).transform((v) => new Date(`${v}T00:00:00.000Z`));

/** Checkbox: present ("on") → true, absent → false. */
export const checkboxField = () =>
  z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true");

export const emailField = () =>
  z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254));

/** Optional Indian/international phone: digits, spaces, +, - and parentheses. */
export const phoneField = () =>
  z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s()-]*$/, "Enter a valid phone number")
    .optional()
    .transform((v) => (v ? v : null));

/** Shared list-page query params. */
export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export const PAGE_SIZE = 25;

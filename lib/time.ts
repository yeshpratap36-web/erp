/**
 * Date/time helpers. Conventions (see prisma/schema.prisma):
 * - A calendar date is a Date at UTC midnight (matches @db.Date).
 * - A time of day is minutes from midnight in the institution's timezone.
 */

const DAY_MS = 86_400_000;

export const WEEKDAY_NAMES = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const WEEKDAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** 570 → "09:30" */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "09:30" → 570; null when malformed. */
export function parseHHMM(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "YYYY-MM-DD" → Date at UTC midnight; null when malformed. */
export function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export const dateKey = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

/** Monday of the week containing `d`. */
export const startOfWeek = (d: Date) => addDays(d, 1 - isoWeekday(d));

/** Inclusive list of calendar dates from `from` to `to`. */
export function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The current calendar date and minute of day in `timeZone`. */
export function nowIn(timeZone: string, now = new Date()): { date: Date; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`),
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

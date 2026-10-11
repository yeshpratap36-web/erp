import { addDays, dateKey, isoWeekday, parseDateKey, startOfWeek } from "@/lib/time";

const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** The Monday-based week to show for `?week=YYYY-MM-DD` (any day in it), defaulting to `today`'s week. */
export function resolveWeek(param: string | undefined, today: Date) {
  const requested = param ? parseDateKey(param) : null;
  const monday = startOfWeek(requested ?? today);
  const sunday = addDays(monday, 6);
  const dates: Record<number, string> = {};
  for (let i = 0; i < 7; i++) dates[i + 1] = shortDate.format(addDays(monday, i));
  return {
    monday,
    sunday,
    dates,
    prev: dateKey(addDays(monday, -7)),
    next: dateKey(addDays(monday, 7)),
    isCurrent: dateKey(monday) === dateKey(startOfWeek(today)),
    todayWeekday: today >= monday && today <= sunday ? isoWeekday(today) : undefined,
    label: `${shortDate.format(monday)} – ${shortDate.format(sunday)}`,
  };
}

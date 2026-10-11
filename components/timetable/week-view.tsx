import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { minutesToHHMM, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/time";

export type WeekItem = {
  key: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: { label: string; variant?: "default" | "secondary" | "destructive" | "outline" };
  muted?: boolean;
  actions?: React.ReactNode;
};

/**
 * Mon–Sat columns on wide screens, stacked days on phones (Sunday only when used).
 * `dates` labels each column with its calendar date (week views of real classes).
 */
export function WeekView({
  items,
  dates,
  highlightDay,
  emptyDay = "No classes",
}: {
  items: WeekItem[];
  dates?: Record<number, string>;
  highlightDay?: number;
  emptyDay?: string;
}) {
  const days = [1, 2, 3, 4, 5, 6, ...(items.some((i) => i.dayOfWeek === 7) ? [7] : [])];
  return (
    <div className={cn("grid gap-3", days.length === 7 ? "md:grid-cols-7" : "md:grid-cols-6")}>
      {days.map((day) => {
        const dayItems = items
          .filter((i) => i.dayOfWeek === day)
          .sort((a, b) => a.startMinute - b.startMinute);
        return (
          <section
            key={day}
            aria-label={WEEKDAY_NAMES[day]}
            className={cn(
              "space-y-2 rounded-xl border p-2",
              day === highlightDay && "border-primary/50 bg-primary/5",
            )}
          >
            <h3 className="px-1 text-sm font-medium">
              <span className="md:hidden">{WEEKDAY_NAMES[day]}</span>
              <span className="hidden md:inline">{WEEKDAY_SHORT[day]}</span>
              {dates?.[day] && (
                <span className="ml-1 font-normal text-muted-foreground">{dates[day]}</span>
              )}
            </h3>
            {dayItems.length === 0 ? (
              <p className="px-1 pb-1 text-xs text-muted-foreground">{emptyDay}</p>
            ) : (
              <ul className="space-y-2">
                {dayItems.map((item) => (
                  <li
                    key={item.key}
                    className={cn(
                      "space-y-1 rounded-lg border bg-card p-2 text-sm",
                      item.muted && "opacity-60",
                    )}
                  >
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {minutesToHHMM(item.startMinute)}–{minutesToHHMM(item.endMinute)}
                    </div>
                    <div className={cn("font-medium", item.muted && "line-through")}>
                      {item.title}
                    </div>
                    {item.subtitle && (
                      <div className="text-xs text-muted-foreground">{item.subtitle}</div>
                    )}
                    {item.meta && <div className="text-xs text-muted-foreground">{item.meta}</div>}
                    {item.badge && (
                      <Badge variant={item.badge.variant ?? "secondary"}>{item.badge.label}</Badge>
                    )}
                    {item.actions}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

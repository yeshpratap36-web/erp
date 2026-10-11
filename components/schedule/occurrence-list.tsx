import { Badge } from "@/components/ui/badge";
import type { OccurrenceView } from "@/lib/services/timetable";
import { minutesToHHMM } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Status label for a dated class. `nowMinute` marks the class in progress (today only). */
export function occurrenceBadge(o: OccurrenceView, nowMinute?: number) {
  if (o.cancelled) return { label: "Cancelled", variant: "destructive" as const };
  if (o.attendanceState === "FINALIZED")
    return { label: "Attendance taken", variant: "secondary" as const };
  if (nowMinute !== undefined && nowMinute >= o.startMinute && nowMinute < o.endMinute) {
    return { label: "Now", variant: "default" as const };
  }
  if (o.kind === "EXTRA") return { label: "Extra class", variant: "outline" as const };
  return undefined;
}

/** Compact list of one day's classes (dashboards). */
export function OccurrenceList({
  occurrences,
  nowMinute,
  show,
  empty,
}: {
  occurrences: OccurrenceView[];
  nowMinute?: number;
  /** Which secondary line to show: the section (faculty) or the teacher (students). */
  show: "section" | "faculty";
  empty: string;
}) {
  if (occurrences.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {occurrences.map((o) => {
        const badge = occurrenceBadge(o, nowMinute);
        return (
          <li key={o.key} className={cn("flex items-start gap-3 p-3", o.cancelled && "opacity-60")}>
            <div className="w-24 shrink-0 text-sm text-muted-foreground tabular-nums">
              {minutesToHHMM(o.startMinute)}–{minutesToHHMM(o.endMinute)}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className={cn("font-medium", o.cancelled && "line-through")}>
                {o.course.code} — {o.course.name}
              </div>
              <div className="text-sm text-muted-foreground">
                {show === "section" ? o.section : o.faculty}
                {o.room && ` · ${o.room}`}
                {o.cancelled && o.cancelReason && ` · ${o.cancelReason}`}
              </div>
            </div>
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </li>
        );
      })}
    </ul>
  );
}

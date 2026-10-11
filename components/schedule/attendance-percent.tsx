import { Badge } from "@/components/ui/badge";
import type { AttendanceSummary } from "@/lib/services/attendance-stats";

export function AttendancePercent({
  summary,
  threshold,
}: {
  summary: AttendanceSummary;
  threshold: number;
}) {
  if (summary.percent === null)
    return <span className="text-muted-foreground">No classes yet</span>;
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      {summary.percent}%
      {summary.belowThreshold && <Badge variant="destructive">Below {threshold}%</Badge>}
    </span>
  );
}

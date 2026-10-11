import { openSessionAction } from "@/app/(faculty)/faculty/actions";
import { ConfirmAction } from "@/components/forms/confirm-action";
import type { OccurrenceView } from "@/lib/services/timetable";
import { addDays, dateKey } from "@/lib/time";

const WINDOW_DAYS = 14; // keep in sync with ATTENDANCE_WINDOW_DAYS (the server enforces it)

/** "Take attendance" / "View attendance" for a class that has started (today or earlier). */
export function AttendanceButton({ o, today }: { o: OccurrenceView; today: Date }) {
  if (o.cancelled || o.date > today) return null;
  const finalized = o.attendanceState === "FINALIZED";
  if (!finalized && !o.sessionId && o.date < addDays(today, -WINDOW_DAYS)) return null;
  const fields: Record<string, string> = o.sessionId
    ? { sessionId: o.sessionId }
    : { slotId: o.slotId!, date: dateKey(o.date) };
  return (
    <ConfirmAction
      action={openSessionAction}
      fields={fields}
      label={finalized ? "View attendance" : "Take attendance"}
      variant={finalized ? "outline" : "default"}
      pendingLabel="Opening…"
    />
  );
}

import type { Metadata } from "next";
import { z } from "zod";
import { PageHeader } from "@/components/admin/page-header";
import { occurrenceBadge } from "@/components/schedule/occurrence-list";
import { WeekNav } from "@/components/timetable/week-nav";
import { WeekView } from "@/components/timetable/week-view";
import { requireRole } from "@/lib/auth/session";
import { APP_TIMEZONE } from "@/lib/config";
import { ownScheduleScope } from "@/lib/services/student";
import { getOccurrences } from "@/lib/services/timetable";
import { isoWeekday, nowIn } from "@/lib/time";
import { resolveWeek } from "@/lib/timetable/week";

export const metadata: Metadata = { title: "Timetable" };

const querySchema = z.object({ week: z.string().max(10).optional().catch(undefined) });

export default async function StudentTimetablePage({
  searchParams,
}: PageProps<"/student/timetable">) {
  const user = await requireRole("STUDENT");
  const { week: weekParam } = querySchema.parse(await searchParams);
  const week = resolveWeek(weekParam, nowIn(APP_TIMEZONE).date);
  const occurrences = await getOccurrences(await ownScheduleScope(user), week.monday, week.sunday);

  return (
    <div className="space-y-6">
      <PageHeader title="Timetable" actions={<WeekNav {...week} basePath="/student/timetable" />} />
      <WeekView
        dates={week.dates}
        highlightDay={week.todayWeekday}
        items={occurrences.map((o) => ({
          key: o.key,
          dayOfWeek: isoWeekday(o.date),
          startMinute: o.startMinute,
          endMinute: o.endMinute,
          title: `${o.course.code} — ${o.course.name}`,
          subtitle: o.faculty,
          meta: [o.room, o.cancelled ? o.cancelReason : null].filter(Boolean).join(" · "),
          badge: occurrenceBadge(o),
          muted: o.cancelled,
        }))}
      />
    </div>
  );
}

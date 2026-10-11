import type { Metadata } from "next";
import { z } from "zod";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField } from "@/components/forms/field";
import { occurrenceBadge } from "@/components/schedule/occurrence-list";
import { WeekNav } from "@/components/timetable/week-nav";
import { WeekView } from "@/components/timetable/week-view";
import { requireRole } from "@/lib/auth/session";
import { APP_TIMEZONE } from "@/lib/config";
import { db } from "@/lib/db";
import { getOccurrences, sectionLabel, type OccurrenceView } from "@/lib/services/timetable";
import { dateKey, isoWeekday, nowIn } from "@/lib/time";
import { resolveWeek } from "@/lib/timetable/week";
import { cancelClassAction, restoreSessionAction, scheduleExtraClassAction } from "../actions";

export const metadata: Metadata = { title: "My timetable" };

const querySchema = z.object({ week: z.string().max(10).optional().catch(undefined) });

function OccurrenceActions({ o, today }: { o: OccurrenceView; today: Date }) {
  // Only upcoming classes without attendance can be changed.
  if (o.date < today || o.attendanceState !== "NOT_TAKEN") return null;
  if (o.slotId && !o.cancelled) {
    return (
      <ConfirmAction
        action={cancelClassAction}
        fields={{ slotId: o.slotId, date: dateKey(o.date) }}
        label="Cancel class"
        prompt={{
          name: "reason",
          message: `Cancel ${o.course.code} on ${dateKey(o.date)}? Reason (optional):`,
        }}
      />
    );
  }
  if (o.sessionId) {
    return (
      <ConfirmAction
        action={restoreSessionAction}
        fields={{ sessionId: o.sessionId }}
        label={o.slotId ? "Restore class" : "Remove extra class"}
        confirm={o.slotId ? undefined : `Remove the extra ${o.course.code} class?`}
      />
    );
  }
  return null;
}

export default async function FacultyTimetablePage({
  searchParams,
}: PageProps<"/faculty/timetable">) {
  const user = await requireRole("FACULTY");
  const facultyId = user.facultyProfile!.id;
  const { week: weekParam } = querySchema.parse(await searchParams);
  const today = nowIn(APP_TIMEZONE).date;
  const week = resolveWeek(weekParam, today);

  const [occurrences, assignments, rooms] = await Promise.all([
    getOccurrences({ facultyId }, week.monday, week.sunday),
    db.facultyAssignment.findMany({
      where: { facultyId, section: { semester: { isCurrent: true } } },
      orderBy: { course: { code: "asc" } },
      select: {
        id: true,
        course: { select: { code: true } },
        section: { select: { name: true, semesterNo: true, program: { select: { code: true } } } },
      },
    }),
    db.room.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My timetable"
        actions={<WeekNav {...week} basePath="/faculty/timetable" />}
      />

      <WeekView
        dates={week.dates}
        highlightDay={week.todayWeekday}
        items={occurrences.map((o) => ({
          key: o.key,
          dayOfWeek: isoWeekday(o.date),
          startMinute: o.startMinute,
          endMinute: o.endMinute,
          title: o.course.code,
          subtitle: o.section,
          meta: [o.room, o.cancelled ? o.cancelReason : null].filter(Boolean).join(" · "),
          badge: occurrenceBadge(o),
          muted: o.cancelled,
          actions: <OccurrenceActions o={o} today={today} />,
        }))}
      />

      <Section
        title="Schedule an extra class"
        description="Checked against your classes, the section's classes and the room."
      >
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You aren&apos;t assigned to any course this term.
          </p>
        ) : (
          <ActionForm
            action={scheduleExtraClassAction}
            submitLabel="Schedule"
            className="sm:grid-cols-3"
          >
            <SelectField
              name="assignmentId"
              label="Course & section"
              placeholder="Choose…"
              options={assignments.map((a) => ({
                value: a.id,
                label: `${a.course.code} · ${sectionLabel(a.section)}`,
              }))}
              required
            />
            <Field name="date" label="Date" type="date" min={dateKey(today)} required />
            <SelectField
              name="roomId"
              label="Room"
              placeholder="Choose…"
              options={rooms.map((r) => ({ value: r.id, label: r.code }))}
              required
            />
            <Field name="startMinute" label="Starts" type="time" step={300} required />
            <Field name="endMinute" label="Ends" type="time" step={300} required />
          </ActionForm>
        )}
      </Section>
    </div>
  );
}

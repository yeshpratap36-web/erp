import type { Metadata } from "next";
import { z } from "zod";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField } from "@/components/forms/field";
import { WeekView } from "@/components/timetable/week-view";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SessionType } from "@/generated/prisma/enums";
import { currentSectionOptions, enumOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { WEEKDAY_NAMES } from "@/lib/time";
import { createSlotAction, deleteSlotAction } from "./actions";

export const metadata: Metadata = { title: "Timetable" };

const querySchema = z.object({ sectionId: z.string().max(40).optional().catch(undefined) });

export default async function TimetablePage({ searchParams }: PageProps<"/admin/timetable">) {
  await requirePermission("timetable:manage");
  const sections = await currentSectionOptions();
  const { sectionId: requested } = querySchema.parse(await searchParams);
  const sectionId = sections.some((s) => s.value === requested) ? requested! : sections[0]?.value;

  if (!sectionId) {
    return (
      <div>
        <PageHeader title="Timetable" />
        <p className="text-sm text-muted-foreground">Create sections for the current term first.</p>
      </div>
    );
  }

  const [slots, assignments, rooms] = await Promise.all([
    db.timetableSlot.findMany({
      where: { sectionId },
      include: {
        course: { select: { code: true, name: true } },
        faculty: { select: { user: { select: { name: true } } } },
        room: { select: { code: true } },
      },
    }),
    db.facultyAssignment.findMany({
      where: { sectionId },
      orderBy: { course: { code: "asc" } },
      select: {
        id: true,
        course: { select: { code: true, name: true } },
        faculty: { select: { user: { select: { name: true } } } },
      },
    }),
    db.room.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, capacity: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetable"
        description="Weekly slots repeat for the whole term, except on holidays."
      />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Section</span>
          <NativeSelect name="sectionId" defaultValue={sectionId}>
            {sections.map((s) => (
              <NativeSelectOption key={s.value} value={s.value}>
                {s.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </form>

      <WeekView
        items={slots.map((s) => ({
          key: s.id,
          dayOfWeek: s.dayOfWeek,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
          title: `${s.course.code} — ${s.course.name}`,
          subtitle: s.faculty.user.name,
          meta: `${s.room.code} · ${s.type.toLowerCase()}`,
          actions: (
            <ConfirmAction
              action={deleteSlotAction}
              fields={{ slotId: s.id }}
              label="Remove"
              confirm={`Remove ${s.course.code} on ${WEEKDAY_NAMES[s.dayOfWeek]}s? Classes with attendance are kept.`}
            />
          ),
        }))}
      />

      <Section
        title="Add weekly slot"
        description="Clashes with the same room, faculty member or section are blocked."
      >
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Assign courses to this section first (Academics → Sections).
          </p>
        ) : (
          <ActionForm action={createSlotAction} submitLabel="Add slot" className="sm:grid-cols-3">
            <SelectField
              name="assignmentId"
              label="Course & faculty"
              placeholder="Choose…"
              options={assignments.map((a) => ({
                value: a.id,
                label: `${a.course.code} — ${a.faculty.user.name}`,
              }))}
              required
            />
            <SelectField
              name="roomId"
              label="Room"
              placeholder="Choose…"
              options={rooms.map((r) => ({ value: r.id, label: `${r.code} (${r.capacity})` }))}
              required
            />
            <SelectField
              name="dayOfWeek"
              label="Day"
              placeholder="Choose…"
              options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
                value: String(d),
                label: WEEKDAY_NAMES[d],
              }))}
              required
            />
            <Field name="startMinute" label="Starts" type="time" step={300} required />
            <Field name="endMinute" label="Ends" type="time" step={300} required />
            <SelectField
              name="type"
              label="Type"
              options={enumOptions(SessionType)}
              defaultValue="LECTURE"
            />
          </ActionForm>
        )}
      </Section>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { CheckboxField, Field, SelectField } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { HolidayType, Term } from "@/generated/prisma/enums";
import { enumOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate, toDateInput } from "@/lib/format";
import {
  createHoliday,
  createSemester,
  deleteAcademicYear,
  deleteHoliday,
  deleteSemester,
  updateAcademicYear,
} from "../../actions";

export const metadata: Metadata = { title: "Academic year" };

export default async function YearPage({ params }: PageProps<"/admin/academics/years/[id]">) {
  await requirePermission("academics:manage");
  const { id } = await params;
  const year = await db.academicYear.findUnique({
    where: { id },
    include: {
      semesters: {
        orderBy: { startDate: "asc" },
        include: { _count: { select: { sections: true } } },
      },
      holidays: { orderBy: { date: "asc" } },
    },
  });
  if (!year) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Academic year ${year.name}`}
        description={`${formatDate(year.startDate)} – ${formatDate(year.endDate)}`}
        back={{ href: "/admin/academics/years", label: "Academic years" }}
        actions={year.isCurrent ? <Badge>Current</Badge> : null}
      />

      <Section
        title="Terms"
        description="Exactly one term is current; sections and attendance belong to a term."
      >
        <DataTable
          rows={year.semesters}
          rowKey={(s) => s.id}
          empty="No terms yet."
          columns={[
            { header: "Term", cell: (s) => s.name },
            {
              header: "Dates",
              cell: (s) => `${formatDate(s.startDate)} – ${formatDate(s.endDate)}`,
              hideOnMobile: true,
            },
            { header: "Sections", cell: (s) => s._count.sections },
            { header: "", cell: (s) => (s.isCurrent ? <Badge>Current</Badge> : null) },
            {
              header: "Actions",
              cell: (s) =>
                s._count.sections === 0 ? (
                  <ConfirmAction
                    action={deleteSemester}
                    fields={{ id: s.id }}
                    label="Delete"
                    confirm={`Delete ${s.name}?`}
                  />
                ) : null,
            },
          ]}
        />
        <ActionForm action={createSemester} submitLabel="Add term" className="pt-2 sm:grid-cols-2">
          <input type="hidden" name="academicYearId" value={year.id} />
          <Field name="name" label="Name" placeholder={`Odd Semester ${year.name}`} required />
          <SelectField
            name="term"
            label="Term"
            options={enumOptions(Term)}
            placeholder="Choose…"
            required
          />
          <Field name="startDate" label="Starts" type="date" required />
          <Field name="endDate" label="Ends" type="date" required />
          <CheckboxField name="isCurrent" label="Make this the current term" />
        </ActionForm>
      </Section>

      <Section title="Holidays" description="No classes are scheduled on these dates.">
        <DataTable
          rows={year.holidays}
          rowKey={(h) => h.id}
          empty="No holidays yet."
          columns={[
            { header: "Date", cell: (h) => formatDate(h.date) },
            { header: "Name", cell: (h) => h.name },
            {
              header: "Type",
              cell: (h) => h.type.toLowerCase().replace("_", " "),
              hideOnMobile: true,
            },
            {
              header: "",
              cell: (h) => (
                <ConfirmAction
                  action={deleteHoliday}
                  fields={{ id: h.id }}
                  label="Remove"
                  confirm={`Remove ${h.name}?`}
                />
              ),
            },
          ]}
        />
        <ActionForm
          action={createHoliday}
          submitLabel="Add holiday"
          className="pt-2 sm:grid-cols-3"
        >
          <input type="hidden" name="academicYearId" value={year.id} />
          <Field name="date" label="Date" type="date" required />
          <Field name="name" label="Name" required />
          <SelectField
            name="type"
            label="Type"
            options={enumOptions(HolidayType)}
            defaultValue="PUBLIC"
          />
        </ActionForm>
      </Section>

      <Section title="Year details">
        <ActionForm action={updateAcademicYear} className="sm:grid-cols-3">
          <input type="hidden" name="id" value={year.id} />
          <Field name="name" label="Name" defaultValue={year.name} required />
          <Field
            name="startDate"
            label="Starts"
            type="date"
            defaultValue={toDateInput(year.startDate)}
            required
          />
          <Field
            name="endDate"
            label="Ends"
            type="date"
            defaultValue={toDateInput(year.endDate)}
            required
          />
          <CheckboxField name="isCurrent" label="Current year" defaultChecked={year.isCurrent} />
        </ActionForm>
      </Section>

      <Section title="Delete" description="Only possible when the year has no terms.">
        <ConfirmAction
          action={deleteAcademicYear}
          fields={{ id: year.id }}
          label="Delete year"
          variant="destructive"
          confirm={`Delete ${year.name}? Its holidays are deleted too.`}
        />
      </Section>
    </div>
  );
}

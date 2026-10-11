import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { CheckboxField, Field } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { createAcademicYear } from "../actions";

export const metadata: Metadata = { title: "Academic years" };

export default async function YearsPage() {
  await requirePermission("academics:manage");
  const years = await db.academicYear.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { semesters: true, holidays: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Academic years" description="Each year holds its terms and holidays." />
      <DataTable
        rows={years}
        rowKey={(y) => y.id}
        empty="No academic years yet."
        columns={[
          {
            header: "Year",
            cell: (y) => (
              <Link
                href={`/admin/academics/years/${y.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {y.name}
              </Link>
            ),
          },
          {
            header: "Dates",
            cell: (y) => `${formatDate(y.startDate)} – ${formatDate(y.endDate)}`,
            hideOnMobile: true,
          },
          { header: "Terms", cell: (y) => y._count.semesters },
          { header: "Holidays", cell: (y) => y._count.holidays, hideOnMobile: true },
          { header: "", cell: (y) => (y.isCurrent ? <Badge>Current</Badge> : null) },
        ]}
      />
      <Section title="Add academic year">
        <ActionForm action={createAcademicYear} submitLabel="Add year" className="sm:grid-cols-3">
          <Field name="name" label="Name" placeholder="2027-28" required />
          <Field name="startDate" label="Starts" type="date" required />
          <Field name="endDate" label="Ends" type="date" required />
          <CheckboxField name="isCurrent" label="Make this the current year" />
        </ActionForm>
      </Section>
    </div>
  );
}

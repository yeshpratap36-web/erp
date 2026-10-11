import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { departmentOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createProgram } from "../actions";

export const metadata: Metadata = { title: "Programs" };

export default async function ProgramsPage() {
  await requirePermission("academics:manage");
  const [programs, departments] = await Promise.all([
    db.program.findMany({
      orderBy: { code: "asc" },
      include: {
        department: { select: { code: true } },
        _count: { select: { students: true, sections: true } },
      },
    }),
    departmentOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Programs" />
      <DataTable
        rows={programs}
        rowKey={(p) => p.id}
        empty="No programs yet."
        columns={[
          {
            header: "Code",
            cell: (p) => (
              <Link
                href={`/admin/academics/programs/${p.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {p.code}
              </Link>
            ),
          },
          { header: "Name", cell: (p) => p.name },
          { header: "Degree", cell: (p) => p.degree, hideOnMobile: true },
          { header: "Department", cell: (p) => p.department.code, hideOnMobile: true },
          { header: "Semesters", cell: (p) => p.totalSemesters, hideOnMobile: true },
          { header: "Students", cell: (p) => p._count.students },
        ]}
      />
      <Section title="Add program">
        {departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a department first.</p>
        ) : (
          <ActionForm action={createProgram} submitLabel="Add program" className="sm:grid-cols-2">
            <Field name="code" label="Code" placeholder="BTECH-CSE" required />
            <Field name="name" label="Name" placeholder="B.Tech Computer Science" required />
            <Field name="degree" label="Degree" placeholder="B.Tech" required />
            <SelectField
              name="departmentId"
              label="Department"
              options={departments}
              placeholder="Choose…"
              required
            />
            <Field
              name="totalSemesters"
              label="Total semesters"
              type="number"
              min={1}
              max={12}
              defaultValue="8"
              required
            />
          </ActionForm>
        )}
      </Section>
    </div>
  );
}

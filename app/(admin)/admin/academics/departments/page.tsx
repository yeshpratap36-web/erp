import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { Field } from "@/components/forms/field";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createDepartment } from "../actions";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  await requirePermission("academics:manage");
  const departments = await db.department.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { programs: true, courses: true, faculty: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Departments" />
      <DataTable
        rows={departments}
        rowKey={(d) => d.id}
        empty="No departments yet."
        columns={[
          {
            header: "Code",
            cell: (d) => (
              <Link
                href={`/admin/academics/departments/${d.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {d.code}
              </Link>
            ),
          },
          { header: "Name", cell: (d) => d.name },
          { header: "Programs", cell: (d) => d._count.programs, hideOnMobile: true },
          { header: "Courses", cell: (d) => d._count.courses, hideOnMobile: true },
          { header: "Faculty", cell: (d) => d._count.faculty, hideOnMobile: true },
        ]}
      />
      <Section title="Add department">
        <ActionForm
          action={createDepartment}
          submitLabel="Add department"
          className="sm:grid-cols-2"
        >
          <Field name="code" label="Code" placeholder="CSE" required />
          <Field name="name" label="Name" placeholder="Computer Science & Engineering" required />
        </ActionForm>
      </Section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { CourseType } from "@/generated/prisma/enums";
import { departmentOptions, enumOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createCourse } from "../actions";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage() {
  await requirePermission("academics:manage");
  const [courses, departments] = await Promise.all([
    db.course.findMany({
      orderBy: { code: "asc" },
      include: { department: { select: { code: true } } },
    }),
    departmentOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Courses" />
      <DataTable
        rows={courses}
        rowKey={(c) => c.id}
        empty="No courses yet."
        columns={[
          {
            header: "Code",
            cell: (c) => (
              <Link
                href={`/admin/academics/courses/${c.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {c.code}
              </Link>
            ),
          },
          { header: "Name", cell: (c) => c.name },
          { header: "Credits", cell: (c) => c.credits },
          {
            header: "Type",
            cell: (c) => <Badge variant="outline">{c.type.toLowerCase()}</Badge>,
            hideOnMobile: true,
          },
          { header: "Department", cell: (c) => c.department.code, hideOnMobile: true },
          { header: "Sem", cell: (c) => c.semesterNo ?? "—", hideOnMobile: true },
        ]}
      />
      <Section title="Add course">
        {departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a department first.</p>
        ) : (
          <ActionForm action={createCourse} submitLabel="Add course" className="sm:grid-cols-2">
            <Field name="code" label="Code" placeholder="CS306" required />
            <Field name="name" label="Name" placeholder="Computer Networks" required />
            <Field
              name="credits"
              label="Credits"
              type="number"
              min={0}
              max={20}
              defaultValue="3"
              required
            />
            <SelectField
              name="type"
              label="Type"
              options={enumOptions(CourseType)}
              defaultValue="THEORY"
            />
            <SelectField
              name="departmentId"
              label="Department"
              options={departments}
              placeholder="Choose…"
              required
            />
            <Field
              name="semesterNo"
              label="Usual semester (optional)"
              type="number"
              min={1}
              max={12}
            />
          </ActionForm>
        )}
      </Section>
    </div>
  );
}

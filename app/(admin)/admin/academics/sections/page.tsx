import type { Metadata } from "next";
import Link from "next/link";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { programOptions, termOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { createSection } from "../actions";

export const metadata: Metadata = { title: "Sections" };

export default async function SectionsPage() {
  await requirePermission("academics:manage");
  const [sections, programs, terms] = await Promise.all([
    db.section.findMany({
      orderBy: [
        { semester: { startDate: "desc" } },
        { program: { code: "asc" } },
        { semesterNo: "asc" },
        { name: "asc" },
      ],
      include: {
        program: { select: { code: true } },
        semester: { select: { name: true, isCurrent: true } },
        _count: { select: { students: true, assignments: true } },
      },
    }),
    programOptions(),
    termOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Sections" description="A cohort of students in a program for one term." />
      <DataTable
        rows={sections}
        rowKey={(s) => s.id}
        empty="No sections yet."
        columns={[
          {
            header: "Section",
            cell: (s) => (
              <Link
                href={`/admin/academics/sections/${s.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {s.program.code} · Sem {s.semesterNo} · {s.name}
              </Link>
            ),
          },
          {
            header: "Term",
            cell: (s) => (
              <span className="inline-flex items-center gap-2">
                {s.semester.name}
                {s.semester.isCurrent && <Badge variant="secondary">Current</Badge>}
              </span>
            ),
            hideOnMobile: true,
          },
          { header: "Students", cell: (s) => `${s._count.students} / ${s.capacity}` },
          { header: "Courses", cell: (s) => s._count.assignments, hideOnMobile: true },
        ]}
      />
      <Section title="Add section">
        {programs.length === 0 || terms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a program and a term first.</p>
        ) : (
          <ActionForm action={createSection} submitLabel="Add section" className="sm:grid-cols-2">
            <SelectField
              name="programId"
              label="Program"
              options={programs}
              placeholder="Choose…"
              required
            />
            <SelectField
              name="semesterId"
              label="Term"
              options={terms}
              defaultValue={terms[0]?.value}
              required
            />
            <Field
              name="semesterNo"
              label="Semester (level)"
              type="number"
              min={1}
              max={12}
              required
            />
            <Field name="name" label="Name" placeholder="A" required />
            <Field
              name="capacity"
              label="Capacity"
              type="number"
              min={1}
              defaultValue="60"
              required
            />
          </ActionForm>
        )}
      </Section>
    </div>
  );
}

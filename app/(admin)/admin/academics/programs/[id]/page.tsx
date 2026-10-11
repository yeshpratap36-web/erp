import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField } from "@/components/forms/field";
import { departmentOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deleteProgram, updateProgram } from "../../actions";

export const metadata: Metadata = { title: "Edit program" };

export default async function ProgramPage({ params }: PageProps<"/admin/academics/programs/[id]">) {
  await requirePermission("academics:manage");
  const { id } = await params;
  const [program, departments] = await Promise.all([
    db.program.findUnique({ where: { id } }),
    departmentOptions(),
  ]);
  if (!program) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={program.name}
        back={{ href: "/admin/academics/programs", label: "Programs" }}
      />
      <Section title="Details">
        <ActionForm action={updateProgram} className="sm:grid-cols-2">
          <input type="hidden" name="id" value={program.id} />
          <Field name="code" label="Code" defaultValue={program.code} required />
          <Field name="name" label="Name" defaultValue={program.name} required />
          <Field name="degree" label="Degree" defaultValue={program.degree} required />
          <SelectField
            name="departmentId"
            label="Department"
            options={departments}
            defaultValue={program.departmentId}
            required
          />
          <Field
            name="totalSemesters"
            label="Total semesters"
            type="number"
            min={1}
            max={12}
            defaultValue={String(program.totalSemesters)}
            required
          />
        </ActionForm>
      </Section>
      <Section
        title="Delete"
        description="Only possible when the program has no sections or students."
      >
        <ConfirmAction
          action={deleteProgram}
          fields={{ id: program.id }}
          label="Delete program"
          variant="destructive"
          confirm={`Delete ${program.code}? This cannot be undone.`}
        />
      </Section>
    </div>
  );
}

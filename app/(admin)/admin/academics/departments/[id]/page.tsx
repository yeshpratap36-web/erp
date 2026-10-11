import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field } from "@/components/forms/field";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deleteDepartment, updateDepartment } from "../../actions";

export const metadata: Metadata = { title: "Edit department" };

export default async function DepartmentPage({
  params,
}: PageProps<"/admin/academics/departments/[id]">) {
  await requirePermission("academics:manage");
  const { id } = await params;
  const dept = await db.department.findUnique({ where: { id } });
  if (!dept) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={dept.name}
        back={{ href: "/admin/academics/departments", label: "Departments" }}
      />
      <Section title="Details">
        <ActionForm action={updateDepartment} className="sm:grid-cols-2">
          <input type="hidden" name="id" value={dept.id} />
          <Field name="code" label="Code" defaultValue={dept.code} required />
          <Field name="name" label="Name" defaultValue={dept.name} required />
        </ActionForm>
      </Section>
      <Section
        title="Delete"
        description="Only possible when no programs, courses or faculty belong to it."
      >
        <ConfirmAction
          action={deleteDepartment}
          fields={{ id: dept.id }}
          label="Delete department"
          variant="destructive"
          confirm={`Delete ${dept.code}? This cannot be undone.`}
        />
      </Section>
    </div>
  );
}

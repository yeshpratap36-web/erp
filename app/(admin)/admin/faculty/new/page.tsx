import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/admin/page-header";
import { departmentOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { CreateFacultyForm } from "../../users/user-forms";

export const metadata: Metadata = { title: "Add faculty" };

export default async function NewFacultyPage() {
  await requirePermission("users:manage");
  const departments = await departmentOptions();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add faculty"
        description="A temporary password is generated and shown once. The employee ID is the login ID."
        back={{ href: "/admin/faculty", label: "Faculty" }}
      />
      <Section title="Faculty details">
        <CreateFacultyForm departments={departments} />
      </Section>
    </div>
  );
}

import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/admin/page-header";
import { currentSectionOptions, programOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { CreateStudentForm } from "../../users/user-forms";

export const metadata: Metadata = { title: "Add student" };

export default async function NewStudentPage() {
  await requirePermission("users:manage");
  const [programs, sections] = await Promise.all([programOptions(), currentSectionOptions()]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add student"
        description="A temporary password is generated and shown once. The roll number is the login ID."
        back={{ href: "/admin/students", label: "Students" }}
      />
      <Section title="Student details">
        <CreateStudentForm
          programs={programs}
          sections={sections}
          defaultYear={new Date().getFullYear()}
        />
      </Section>
    </div>
  );
}

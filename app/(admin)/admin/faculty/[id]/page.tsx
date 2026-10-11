import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { AccountStatusBadges } from "@/components/admin/status-badges";
import { ActionForm } from "@/components/forms/action-form";
import { Field, SelectField } from "@/components/forms/field";
import { departmentOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { updateFacultyAction } from "../../users/actions";
import { AccountActions } from "../../users/user-forms";

export const metadata: Metadata = { title: "Faculty member" };

export default async function FacultyPage({ params }: PageProps<"/admin/faculty/[id]">) {
  const admin = await requirePermission("users:manage");
  const { id } = await params;
  const user = await db.user.findFirst({
    where: { id, role: "FACULTY", deletedAt: null },
    include: {
      facultyProfile: {
        include: {
          assignments: {
            orderBy: { course: { code: "asc" } },
            include: {
              course: { select: { code: true, name: true } },
              section: {
                select: {
                  id: true,
                  name: true,
                  semesterNo: true,
                  program: { select: { code: true } },
                  semester: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!user?.facultyProfile) notFound();
  const profile = user.facultyProfile;
  const departments = await departmentOptions();
  const isLocked = !!user.lockedUntil && user.lockedUntil > new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {user.loginId} · {user.email} <AccountStatusBadges {...user} />
          </span>
        }
        back={{ href: "/admin/faculty", label: "Faculty" }}
      />

      <Section title="Teaching" description="Assign courses from a section's page.">
        <DataTable
          rows={profile.assignments}
          rowKey={(a) => a.id}
          empty="Not assigned to any section yet."
          columns={[
            { header: "Course", cell: (a) => `${a.course.code} — ${a.course.name}` },
            {
              header: "Section",
              cell: (a) => (
                <Link
                  href={`/admin/academics/sections/${a.section.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {a.section.program.code} · Sem {a.section.semesterNo} · {a.section.name}
                </Link>
              ),
            },
            { header: "Term", cell: (a) => a.section.semester.name, hideOnMobile: true },
          ]}
        />
      </Section>

      <Section title="Profile">
        <ActionForm action={updateFacultyAction} className="sm:grid-cols-2">
          <input type="hidden" name="userId" value={user.id} />
          <Field name="name" label="Full name" defaultValue={user.name} required />
          <Field
            name="email"
            label="College email"
            type="email"
            defaultValue={user.email}
            required
          />
          <Field name="phone" label="Phone (optional)" type="tel" defaultValue={user.phone ?? ""} />
          <SelectField
            name="departmentId"
            label="Department"
            options={departments}
            defaultValue={profile.departmentId}
            required
          />
          <Field
            name="designation"
            label="Designation (optional)"
            defaultValue={profile.designation ?? ""}
          />
        </ActionForm>
      </Section>

      <Section title="Account">
        <dl className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          <div>Last sign-in: {formatDateTime(user.lastLoginAt)}</div>
          <div>Password changed: {formatDateTime(user.passwordChangedAt)}</div>
        </dl>
        <AccountActions
          userId={user.id}
          name={user.name}
          isActive={user.isActive}
          isLocked={isLocked}
          isSelf={user.id === admin.id}
        />
      </Section>
    </div>
  );
}

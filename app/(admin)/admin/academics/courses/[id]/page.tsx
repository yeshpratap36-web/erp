import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField } from "@/components/forms/field";
import { CourseType } from "@/generated/prisma/enums";
import { departmentOptions, enumOptions } from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { deleteCourse, updateCourse } from "../../actions";

export const metadata: Metadata = { title: "Edit course" };

export default async function CoursePage({ params }: PageProps<"/admin/academics/courses/[id]">) {
  await requirePermission("academics:manage");
  const { id } = await params;
  const [course, departments] = await Promise.all([
    db.course.findUnique({ where: { id } }),
    departmentOptions(),
  ]);
  if (!course) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${course.code} — ${course.name}`}
        back={{ href: "/admin/academics/courses", label: "Courses" }}
      />
      <Section title="Details">
        <ActionForm action={updateCourse} className="sm:grid-cols-2">
          <input type="hidden" name="id" value={course.id} />
          <Field name="code" label="Code" defaultValue={course.code} required />
          <Field name="name" label="Name" defaultValue={course.name} required />
          <Field
            name="credits"
            label="Credits"
            type="number"
            min={0}
            max={20}
            defaultValue={String(course.credits)}
            required
          />
          <SelectField
            name="type"
            label="Type"
            options={enumOptions(CourseType)}
            defaultValue={course.type}
          />
          <SelectField
            name="departmentId"
            label="Department"
            options={departments}
            defaultValue={course.departmentId}
            required
          />
          <Field
            name="semesterNo"
            label="Usual semester (optional)"
            type="number"
            min={1}
            max={12}
            defaultValue={course.semesterNo?.toString() ?? ""}
          />
        </ActionForm>
      </Section>
      <Section
        title="Delete"
        description="Only possible when the course isn't offered, scheduled or graded anywhere."
      >
        <ConfirmAction
          action={deleteCourse}
          fields={{ id: course.id }}
          label="Delete course"
          variant="destructive"
          confirm={`Delete ${course.code}? This cannot be undone.`}
        />
      </Section>
    </div>
  );
}

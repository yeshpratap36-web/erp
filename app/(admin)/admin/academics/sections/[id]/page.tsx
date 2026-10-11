import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField } from "@/components/forms/field";
import {
  activeFacultyOptions,
  courseOptions,
  programOptions,
  termOptions,
} from "@/lib/admin/options";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  addSectionCourse,
  deleteSection,
  removeSectionCourseAction,
  updateSection,
} from "../../actions";

export const metadata: Metadata = { title: "Section" };

export default async function SectionPage({ params }: PageProps<"/admin/academics/sections/[id]">) {
  await requirePermission("academics:manage");
  const { id } = await params;
  const section = await db.section.findUnique({
    where: { id },
    include: {
      program: { select: { code: true } },
      semester: { select: { name: true } },
      assignments: {
        orderBy: { course: { code: "asc" } },
        include: {
          course: { select: { code: true, name: true, credits: true } },
          faculty: { select: { employeeId: true, user: { select: { name: true } } } },
        },
      },
      students: {
        where: { deletedAt: null },
        orderBy: { rollNumber: "asc" },
        select: {
          id: true,
          rollNumber: true,
          userId: true,
          user: { select: { name: true, isActive: true } },
        },
      },
    },
  });
  if (!section) notFound();

  const [courses, faculty, programs, terms, enrollmentCounts] = await Promise.all([
    courseOptions(),
    activeFacultyOptions(),
    programOptions(),
    termOptions(),
    db.enrollment.groupBy({ by: ["courseId"], where: { sectionId: id }, _count: true }),
  ]);
  const enrolledByCourse = new Map(enrollmentCounts.map((e) => [e.courseId, e._count]));
  const title = `${section.program.code} · Sem ${section.semesterNo} · ${section.name}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={`${section.semester.name} · ${section.students.length} / ${section.capacity} students`}
        back={{ href: "/admin/academics/sections", label: "Sections" }}
      />

      <Section
        title="Courses & faculty"
        description="Assigning a course enrolls every student of this section in it."
      >
        <DataTable
          rows={section.assignments}
          rowKey={(a) => a.id}
          empty="No courses assigned yet."
          columns={[
            { header: "Course", cell: (a) => `${a.course.code} — ${a.course.name}` },
            { header: "Faculty", cell: (a) => `${a.faculty.user.name} (${a.faculty.employeeId})` },
            {
              header: "Enrolled",
              cell: (a) => enrolledByCourse.get(a.courseId) ?? 0,
              hideOnMobile: true,
            },
            {
              header: "",
              cell: (a) => (
                <ConfirmAction
                  action={removeSectionCourseAction}
                  fields={{ id: a.id }}
                  label="Remove"
                  confirm={`Remove ${a.course.code} taught by ${a.faculty.user.name} from this section?`}
                />
              ),
            },
          ]}
        />
        {courses.length === 0 || faculty.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create courses and faculty accounts first.
          </p>
        ) : (
          <ActionForm
            action={addSectionCourse}
            submitLabel="Assign course"
            className="pt-2 sm:grid-cols-2"
          >
            <input type="hidden" name="sectionId" value={section.id} />
            <SelectField
              name="courseId"
              label="Course"
              options={courses}
              placeholder="Choose…"
              required
            />
            <SelectField
              name="facultyId"
              label="Faculty"
              options={faculty}
              placeholder="Choose…"
              required
            />
          </ActionForm>
        )}
      </Section>

      <Section
        title={`Students (${section.students.length})`}
        description="Move students between sections from their profile page."
      >
        <DataTable
          rows={section.students}
          rowKey={(s) => s.id}
          empty="No students in this section."
          columns={[
            {
              header: "Roll no.",
              cell: (s) => (
                <Link
                  href={`/admin/students/${s.userId}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {s.rollNumber}
                </Link>
              ),
            },
            { header: "Name", cell: (s) => s.user.name },
            {
              header: "Status",
              cell: (s) => (s.user.isActive ? "Active" : "Inactive"),
              hideOnMobile: true,
            },
          ]}
        />
      </Section>

      <Section title="Section details">
        <ActionForm action={updateSection} className="sm:grid-cols-2">
          <input type="hidden" name="id" value={section.id} />
          <SelectField
            name="programId"
            label="Program"
            options={programs}
            defaultValue={section.programId}
            required
          />
          <SelectField
            name="semesterId"
            label="Term"
            options={terms}
            defaultValue={section.semesterId}
            required
          />
          <Field
            name="semesterNo"
            label="Semester (level)"
            type="number"
            min={1}
            max={12}
            defaultValue={String(section.semesterNo)}
            required
          />
          <Field name="name" label="Name" defaultValue={section.name} required />
          <Field
            name="capacity"
            label="Capacity"
            type="number"
            min={1}
            defaultValue={String(section.capacity)}
            required
          />
        </ActionForm>
      </Section>

      <Section
        title="Delete"
        description="Only possible when the section has no students, class sessions or exams."
      >
        <ConfirmAction
          action={deleteSection}
          fields={{ id: section.id }}
          label="Delete section"
          variant="destructive"
          confirm={`Delete ${title}? Its course assignments and enrollments are removed too.`}
        />
      </Section>
    </div>
  );
}

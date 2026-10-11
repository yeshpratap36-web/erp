import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ColumnChart } from "@/components/charts/column-chart";
import { CourseTabs } from "@/components/faculty/course-tabs";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { ExamType } from "@/generated/prisma/enums";
import { enumOptions } from "@/lib/admin/options";
import { canAccessSection } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { gradebook } from "@/lib/services/exams";
import { sectionLabel } from "@/lib/services/timetable";
import { createExamAction, publishResultsAction } from "../../../../actions";

export const metadata: Metadata = { title: "Marks & grades" };

export default async function CourseMarksPage({
  params,
}: PageProps<"/faculty/courses/[sectionId]/[courseId]/marks">) {
  const user = await requireRole("FACULTY");
  const { sectionId, courseId } = await params;
  if (!(await canAccessSection(user, sectionId, courseId))) notFound();

  const [section, course, book] = await Promise.all([
    db.section.findUniqueOrThrow({
      where: { id: sectionId },
      select: { name: true, semesterNo: true, program: { select: { code: true } } },
    }),
    db.course.findUniqueOrThrow({ where: { id: courseId }, select: { code: true, name: true } }),
    gradebook(sectionId, courseId),
  ]);
  const base = `/faculty/courses/${sectionId}/${courseId}`;
  const remaining = Math.round((100 - book.totalWeight) * 100) / 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${course.code} — ${course.name}`}
        description={`${sectionLabel(section)} · ${book.students.length} students · ${book.credits} credits`}
        back={{ href: "/faculty", label: "Dashboard" }}
      />
      <CourseTabs sectionId={sectionId} courseId={courseId} />

      <Section
        title="Assessments"
        description={`Weightage used: ${book.totalWeight}% of 100%. Students see marks only after you publish an exam.`}
      >
        {book.exams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assessments yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {book.exams.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                <Link
                  href={`${base}/exams/${e.id}`}
                  className="min-w-40 flex-1 font-medium underline-offset-4 hover:underline"
                >
                  {e.name}
                </Link>
                <span className="text-muted-foreground">
                  {e.type.toLowerCase()} · out of {e.maxMarks} · {e.weightage}%
                  {e.date ? ` · ${formatDate(e.date)}` : ""}
                </span>
                <span className="tabular-nums">
                  {e.entered}/{book.students.length} marked
                  {e.stats && ` · avg ${e.stats.average}`}
                </span>
                {e.isPublished ? (
                  <Badge variant="secondary">Published</Badge>
                ) : (
                  <Badge variant="outline">Draft</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
        {remaining > 0 ? (
          <ActionForm
            action={createExamAction}
            submitLabel="Add assessment"
            className="pt-2 sm:grid-cols-3"
          >
            <input type="hidden" name="sectionId" value={sectionId} />
            <input type="hidden" name="courseId" value={courseId} />
            <Field name="name" label="Name" placeholder="Quiz 2" required />
            <SelectField
              name="type"
              label="Type"
              options={enumOptions(ExamType)}
              defaultValue="QUIZ"
            />
            <Field name="date" label="Date (optional)" type="date" />
            <Field
              name="maxMarks"
              label="Maximum marks"
              type="number"
              min={1}
              step="any"
              required
            />
            <Field
              name="weightage"
              label="Weightage (%)"
              type="number"
              min={0}
              max={remaining}
              step="any"
              hint={`${remaining}% remaining`}
              required
            />
          </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">All 100% of the weightage is allocated.</p>
        )}
      </Section>

      <Section
        title="Gradebook"
        description="Running percentages use the assessments marked so far."
      >
        {book.students.length === 0 ? (
          <p className="text-sm text-muted-foreground">No students are enrolled.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="p-2 font-medium">Roll no.</th>
                  <th className="hidden p-2 font-medium md:table-cell">Name</th>
                  {book.exams.map((e) => (
                    <th key={e.id} className="p-2 text-right font-medium whitespace-nowrap">
                      {e.name}
                      <span className="block text-[10px] font-normal">/{e.maxMarks}</span>
                    </th>
                  ))}
                  <th className="p-2 text-right font-medium">%</th>
                  <th className="p-2 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody>
                {book.students.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="p-2 font-medium">{s.rollNumber}</td>
                    <td className="hidden p-2 text-muted-foreground md:table-cell">{s.name}</td>
                    {book.exams.map((e) => {
                      const m = s.marks.get(e.id);
                      return (
                        <td key={e.id} className="p-2 text-right tabular-nums">
                          {!m ? "—" : m.isAbsent ? "AB" : (m.marksObtained ?? "—")}
                        </td>
                      );
                    })}
                    <td className="p-2 text-right tabular-nums">{s.progress.percent ?? "—"}</td>
                    <td className="p-2">
                      {s.grade ?? "—"}
                      {s.publishedGrade && s.publishedGrade !== s.grade && (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          (published {s.publishedGrade})
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {book.stats && (
          <p className="text-sm text-muted-foreground">
            Class average {book.stats.average}% · median {book.stats.median}% · range{" "}
            {book.stats.min}–{book.stats.max}%
          </p>
        )}
      </Section>

      {book.stats && (
        <Section title="Grade distribution">
          <ColumnChart
            title={`${course.code} grades (current)`}
            valueLabel="Students"
            unit={["student", "students"]}
            data={book.distribution.map((d) => ({ label: d.letter, value: d.count }))}
          />
        </Section>
      )}

      <Section
        title="Final grades"
        description="Publishing snapshots each student's grade for SGPA/CGPA. You can re-publish after corrections."
      >
        {book.resultsPublished && <Badge variant="secondary">Published</Badge>}
        {book.allComplete && book.totalWeight === 100 ? (
          <ConfirmAction
            action={publishResultsAction}
            fields={{ sectionId, courseId }}
            label={book.resultsPublished ? "Re-publish final grades" : "Publish final grades"}
            variant="default"
            confirm="Publish final grades to students? They will count toward SGPA and CGPA."
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Available once weightages total 100% and every student has marks for every assessment.
          </p>
        )}
      </Section>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/page-header";
import { MarksGrid } from "@/components/faculty/marks-grid";
import { MarksImport } from "@/components/faculty/marks-import";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Badge } from "@/components/ui/badge";
import { canAccessSection } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { courseRoster } from "@/lib/services/exams";
import {
  deleteExamAction,
  importMarksAction,
  saveMarksAction,
  setExamPublishedAction,
} from "../../../../../actions";

export const metadata: Metadata = { title: "Enter marks" };

export default async function ExamMarksPage({
  params,
}: PageProps<"/faculty/courses/[sectionId]/[courseId]/exams/[examId]">) {
  const user = await requireRole("FACULTY");
  const { sectionId, courseId, examId } = await params;
  const exam = await db.exam.findUnique({
    where: { id: examId },
    include: { course: { select: { code: true } }, marks: true },
  });
  // The exam must belong to this URL's section/course, which the faculty member must teach.
  if (!exam || exam.sectionId !== sectionId || exam.courseId !== courseId) notFound();
  if (!(await canAccessSection(user, sectionId, courseId))) notFound();

  const roster = await courseRoster(sectionId, courseId);
  const marks = new Map(exam.marks.map((m) => [m.studentId, m]));
  const back = `/faculty/courses/${sectionId}/${courseId}/marks`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${exam.course.code} · ${exam.name}`}
        description={`${exam.type.toLowerCase()} · out of ${exam.maxMarks} · ${exam.weightage}% weightage${exam.date ? ` · ${formatDate(exam.date)}` : ""}`}
        back={{ href: back, label: "Marks & grades" }}
        actions={
          exam.isPublished ? (
            <Badge variant="secondary">Published</Badge>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )
        }
      />

      <Section
        title="Marks"
        description={exam.isPublished ? "This exam is published — changes are logged." : undefined}
      >
        <MarksGrid
          examId={exam.id}
          maxMarks={exam.maxMarks}
          action={saveMarksAction}
          students={roster.map((s) => ({
            ...s,
            marks: marks.get(s.id)?.marksObtained ?? null,
            absent: marks.get(s.id)?.isAbsent ?? false,
          }))}
        />
      </Section>

      <Section title="Import from CSV">
        <MarksImport examId={exam.id} action={importMarksAction} />
      </Section>

      <Section title={exam.isPublished ? "Published" : "Publish"}>
        <div className="flex flex-wrap gap-4">
          <ConfirmAction
            action={setExamPublishedAction}
            fields={{ examId: exam.id, published: String(!exam.isPublished) }}
            label={exam.isPublished ? "Unpublish" : "Publish marks to students"}
            variant={exam.isPublished ? "outline" : "default"}
            confirm={
              exam.isPublished
                ? "Hide these marks from students?"
                : "Students will see their marks for this exam."
            }
          />
          {!exam.isPublished && (
            <ConfirmAction
              action={deleteExamAction}
              fields={{ examId: exam.id, back }}
              label="Delete exam"
              variant="destructive"
              confirm={`Delete ${exam.name} and all its marks?`}
            />
          )}
        </div>
      </Section>
    </div>
  );
}

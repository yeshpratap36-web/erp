import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { AttendancePercent } from "@/components/schedule/attendance-percent";
import { Badge } from "@/components/ui/badge";
import { canAccessSection } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sectionCourseRoster } from "@/lib/services/attendance-stats";
import { sectionLabel } from "@/lib/services/timetable";
import { setStudentFaceReenrollAction } from "../../../actions";

export const metadata: Metadata = { title: "Course roster" };

export default async function CourseRosterPage({
  params,
}: PageProps<"/faculty/courses/[sectionId]/[courseId]">) {
  const user = await requireRole("FACULTY");
  const { sectionId, courseId } = await params;
  // Layer 3: faculty may only open sections/courses assigned to them. Same 404 either way.
  if (!(await canAccessSection(user, sectionId, courseId))) notFound();

  const [section, course, roster] = await Promise.all([
    db.section.findUnique({
      where: { id: sectionId },
      select: { name: true, semesterNo: true, program: { select: { code: true } } },
    }),
    db.course.findUnique({ where: { id: courseId }, select: { code: true, name: true } }),
    sectionCourseRoster(sectionId, courseId),
  ]);
  if (!section || !course) notFound();
  const low = roster.students.filter((s) => s.belowThreshold);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${course.code} — ${course.name}`}
        description={`${sectionLabel(section)} · ${roster.students.length} students · ${roster.held} classes held · threshold ${roster.threshold}%`}
        back={{ href: "/faculty", label: "Dashboard" }}
      />
      {low.length > 0 && (
        <p className="text-sm">
          <Badge variant="destructive">{low.length}</Badge> student
          {low.length === 1 ? " is" : "s are"} below {roster.threshold}%.
        </p>
      )}
      <DataTable
        rows={roster.students}
        rowKey={(s) => s.id}
        empty="No students are enrolled."
        columns={[
          { header: "Roll no.", cell: (s) => <span className="font-medium">{s.rollNumber}</span> },
          { header: "Name", cell: (s) => s.name },
          { header: "Attended", cell: (s) => `${s.attended} / ${s.total}`, hideOnMobile: true },
          {
            header: "Attendance",
            cell: (s) => <AttendancePercent summary={s} threshold={roster.threshold} />,
          },
          {
            header: "To reach threshold",
            cell: (s) => (s.belowThreshold ? `${s.needed} more` : "—"),
            hideOnMobile: true,
          },
          {
            header: "Face",
            cell: (s) => (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  {s.faceEnrolled ? "Enrolled" : "Not enrolled"}
                  {s.faceReenrollAllowed && " · retake allowed"}
                </span>
                <ConfirmAction
                  action={setStudentFaceReenrollAction}
                  fields={{ studentId: s.id, allowed: String(!s.faceReenrollAllowed) }}
                  label={s.faceReenrollAllowed ? "Revoke retake" : "Allow retake"}
                />
              </div>
            ),
            hideOnMobile: true,
          },
        ]}
      />
    </div>
  );
}

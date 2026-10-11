import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Section } from "@/components/admin/page-header";
import { AttendanceButton } from "@/components/attendance/attendance-button";
import { OccurrenceList } from "@/components/schedule/occurrence-list";
import { requireRole } from "@/lib/auth/session";
import { APP_TIMEZONE } from "@/lib/config";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getOccurrences, sectionLabel } from "@/lib/services/timetable";
import { nowIn } from "@/lib/time";

export const metadata: Metadata = { title: "Faculty dashboard" };

export default async function FacultyDashboardPage() {
  const user = await requireRole("FACULTY");
  const facultyId = user.facultyProfile!.id;
  const now = nowIn(APP_TIMEZONE);

  const [today, assignments] = await Promise.all([
    getOccurrences({ facultyId }, now.date, now.date),
    db.facultyAssignment.findMany({
      where: { facultyId, section: { semester: { isCurrent: true } } },
      orderBy: [{ course: { code: "asc" } }, { section: { name: "asc" } }],
      select: {
        sectionId: true,
        courseId: true,
        course: { select: { code: true, name: true } },
        section: { select: { name: true, semesterNo: true, program: { select: { code: true } } } },
      },
    }),
  ]);
  const [enrolled, held] = await Promise.all([
    db.enrollment.groupBy({
      by: ["sectionId", "courseId"],
      where: { OR: assignments.map((a) => ({ sectionId: a.sectionId, courseId: a.courseId })) },
      _count: true,
    }),
    db.classSession.groupBy({
      by: ["sectionId", "courseId"],
      where: {
        facultyId,
        attendanceState: "FINALIZED",
        status: { not: "CANCELLED" },
        OR: assignments.map((a) => ({ sectionId: a.sectionId, courseId: a.courseId })),
      },
      _count: true,
    }),
  ]);
  const count = (
    rows: { sectionId: string; courseId: string; _count: number }[],
    a: (typeof assignments)[number],
  ) => rows.find((r) => r.sectionId === a.sectionId && r.courseId === a.courseId)?._count ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user.name}`} description={formatDate(now.date)} />

      <Section
        title="Today's classes"
        actions={
          <Link href="/faculty/timetable" className="text-sm underline underline-offset-4">
            Full timetable
          </Link>
        }
      >
        <OccurrenceList
          occurrences={today}
          nowMinute={now.minute}
          show="section"
          empty="No classes today."
          renderAction={(o) => <AttendanceButton o={o} today={now.date} />}
        />
      </Section>

      <Section
        title="My courses"
        description="This term's sections. Open one for its roster and attendance."
      >
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You aren&apos;t assigned to any course this term yet.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assignments.map((a) => (
              <li key={`${a.sectionId}:${a.courseId}`}>
                <Link
                  href={`/faculty/courses/${a.sectionId}/${a.courseId}`}
                  className="block space-y-1 rounded-xl border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="font-medium">
                    {a.course.code} — {a.course.name}
                  </div>
                  <div className="text-sm text-muted-foreground">{sectionLabel(a.section)}</div>
                  <div className="text-xs text-muted-foreground">
                    {count(enrolled, a)} students · {count(held, a)} classes held
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

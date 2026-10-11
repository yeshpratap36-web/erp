import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";
import { PageHeader, Section } from "@/components/admin/page-header";
import { AttendancePercent } from "@/components/schedule/attendance-percent";
import { OccurrenceList } from "@/components/schedule/occurrence-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ownStudentId } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { APP_TIMEZONE } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { studentAttendance } from "@/lib/services/attendance-stats";
import { studentResults } from "@/lib/services/results";
import { ownScheduleScope } from "@/lib/services/student";
import { getOccurrences } from "@/lib/services/timetable";
import { nowIn } from "@/lib/time";

export const metadata: Metadata = { title: "Home" };

export default async function StudentHomePage() {
  const user = await requireRole("STUDENT");
  const now = nowIn(APP_TIMEZONE);
  const [attendance, today, results] = await Promise.all([
    studentAttendance(ownStudentId(user)),
    ownScheduleScope(user).then((scope) => getOccurrences(scope, now.date, now.date)),
    studentResults(ownStudentId(user)),
  ]);
  const { overall, threshold, courses } = attendance;
  const lowCourses = courses.filter((c) => c.belowThreshold);

  return (
    <div className="space-y-6">
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} description={formatDate(now.date)} />

      {(overall.belowThreshold || lowCourses.length > 0) && (
        <Alert variant="destructive" data-testid="attendance-warning">
          <AlertTriangleIcon />
          <AlertTitle>Attendance below {threshold}%</AlertTitle>
          <AlertDescription>
            {overall.belowThreshold
              ? `Attend the next ${overall.needed} classes in a row to get back to ${threshold}% overall.`
              : `You're fine overall, but ${lowCourses.map((c) => c.code).join(", ")} ${lowCourses.length === 1 ? "is" : "are"} below ${threshold}%.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-muted-foreground">Overall attendance</div>
          <div className="text-3xl font-semibold tabular-nums" data-testid="overall-percent">
            {overall.percent === null ? "—" : `${overall.percent}%`}
          </div>
          <div className="text-xs text-muted-foreground">
            {overall.attended} of {overall.total} classes
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-muted-foreground">
            {overall.belowThreshold ? "Classes needed" : "Can still miss"}
          </div>
          <div className="text-3xl font-semibold tabular-nums">
            {overall.belowThreshold ? overall.needed : overall.canMiss}
          </div>
          <div className="text-xs text-muted-foreground">
            {overall.belowThreshold ? "to reach" : "to stay at"} {threshold}% overall
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-muted-foreground">Classes today</div>
          <div className="text-3xl font-semibold tabular-nums">
            {today.filter((o) => !o.cancelled).length}
          </div>
          <div className="text-xs text-muted-foreground">
            {today.some((o) => o.cancelled)
              ? `${today.filter((o) => o.cancelled).length} cancelled`
              : " "}
          </div>
        </div>
      </div>

      <Section
        title="Today"
        actions={
          <Link href="/student/timetable" className="text-sm underline underline-offset-4">
            Week view
          </Link>
        }
      >
        <OccurrenceList
          occurrences={today}
          nowMinute={now.minute}
          show="faculty"
          empty="No classes today."
        />
      </Section>

      <Section
        title="Attendance by subject"
        actions={
          <Link href="/student/attendance" className="text-sm underline underline-offset-4">
            Details
          </Link>
        }
      >
        <ul className="divide-y rounded-lg border">
          {courses.map((c) => (
            <li key={c.courseId} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                <span className="font-medium">{c.code}</span>{" "}
                <span className="text-muted-foreground">{c.name}</span>
              </span>
              <AttendancePercent summary={c} threshold={threshold} />
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Section
          title="Results"
          actions={
            <Link href="/student/results" className="text-sm underline underline-offset-4">
              Details
            </Link>
          }
        >
          <p className="text-sm">
            CGPA{" "}
            <span className="font-semibold tabular-nums">{results.cgpa?.toFixed(2) ?? "—"}</span>
            {results.terms.length > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · latest SGPA {results.terms.at(-1)!.sgpa?.toFixed(2) ?? "—"}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {results.current.filter((c) => c.progress.percent !== null).length} of{" "}
            {results.current.length} courses have published marks this term.
          </p>
        </Section>
        <Section title="Announcements">
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        </Section>
      </div>
    </div>
  );
}

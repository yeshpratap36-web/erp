import type { Metadata } from "next";
import { DataTable } from "@/components/admin/data-table";
import { Pagination } from "@/components/admin/list-controls";
import { PageHeader, Section } from "@/components/admin/page-header";
import { AttendancePercent } from "@/components/schedule/attendance-percent";
import { Badge } from "@/components/ui/badge";
import { ownStudentId } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { studentAttendance, studentAttendanceLog } from "@/lib/services/attendance-stats";
import { minutesToHHMM } from "@/lib/time";
import { listQuerySchema, PAGE_SIZE } from "@/lib/validators/common";

export const metadata: Metadata = { title: "Attendance" };

const STATUS_VARIANT = {
  PRESENT: "secondary",
  LATE: "outline",
  ABSENT: "destructive",
  EXCUSED: "outline",
} as const;

export default async function StudentAttendancePage({
  searchParams,
}: PageProps<"/student/attendance">) {
  const user = await requireRole("STUDENT");
  const studentId = ownStudentId(user);
  const { page } = listQuerySchema.parse(await searchParams);
  const [{ overall, threshold, courses }, log] = await Promise.all([
    studentAttendance(studentId),
    studentAttendanceLog(studentId, { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description={`Overall ${overall.percent ?? "—"}% (${overall.attended}/${overall.total}). Late counts as present; excused classes don't count.`}
      />
      <Section title="By subject">
        <DataTable
          rows={courses}
          rowKey={(c) => c.courseId}
          empty="You aren't enrolled in any course yet."
          columns={[
            { header: "Subject", cell: (c) => <span className="font-medium">{c.code}</span> },
            { header: "Name", cell: (c) => c.name, hideOnMobile: true },
            { header: "Attended", cell: (c) => `${c.attended} / ${c.total}` },
            { header: "%", cell: (c) => <AttendancePercent summary={c} threshold={threshold} /> },
            {
              header: `To reach ${threshold}%`,
              cell: (c) => (c.belowThreshold ? `${c.needed} classes` : `can miss ${c.canMiss}`),
              hideOnMobile: true,
            },
          ]}
        />
      </Section>
      <Section title="Day by day">
        <DataTable
          rows={log.rows}
          rowKey={(r) => r.id}
          empty="No attendance has been recorded yet."
          columns={[
            { header: "Date", cell: (r) => formatDate(r.session.date) },
            {
              header: "Time",
              cell: (r) => minutesToHHMM(r.session.startMinute),
              hideOnMobile: true,
            },
            { header: "Subject", cell: (r) => r.session.course.code },
            {
              header: "Status",
              cell: (r) => (
                <Badge variant={STATUS_VARIANT[r.status]}>{r.status.toLowerCase()}</Badge>
              ),
            },
          ]}
        />
        <Pagination page={page} total={log.total} params={{}} />
      </Section>
    </div>
  );
}

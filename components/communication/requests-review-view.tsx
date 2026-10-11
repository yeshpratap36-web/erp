import { reviewCorrectionAction, reviewLeaveAction } from "@/app/actions/communication";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ReviewControls } from "@/components/communication/review-controls";
import { Badge } from "@/components/ui/badge";
import type { CurrentUser } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/format";
import { listRequests } from "@/lib/services/requests";
import { sectionLabel } from "@/lib/services/timetable";
import { minutesToHHMM } from "@/lib/time";

const STATUS_VARIANT = {
  APPROVED: "secondary",
  REJECTED: "destructive",
  CANCELLED: "outline",
  PENDING: "outline",
} as const;

type Student = {
  rollNumber: string;
  user: { name: string };
  section: { name: string; semesterNo: number; program: { code: string } } | null;
};
const who = (s: Student) =>
  `${s.rollNumber} ${s.user.name}${s.section ? ` · ${sectionLabel(s.section)}` : ""}`;

/** Faculty: their sections/classes. Admin: everything. */
export async function RequestsReviewView({ user }: { user: CurrentUser }) {
  const [pending, decided] = await Promise.all([
    listRequests(user, "PENDING"),
    listRequests(user, "DECIDED"),
  ]);
  const count = pending.leaves.length + pending.corrections.length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        description={count ? `${count} waiting for a decision` : "Nothing waiting for a decision."}
      />

      <Section
        title={`Leave requests (${pending.leaves.length} pending)`}
        description="Approving marks recorded absences in the period as excused."
      >
        {pending.leaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending leave requests.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {pending.leaves.map((l) => (
              <li key={l.id} className="space-y-2 p-3" data-testid="pending-leave">
                <div className="text-sm font-medium">{who(l.student)}</div>
                <div className="text-sm">
                  {formatDate(l.fromDate)} – {formatDate(l.toDate)}
                </div>
                <p className="text-sm text-muted-foreground">{l.reason}</p>
                <ReviewControls requestId={l.id} action={reviewLeaveAction} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Attendance corrections (${pending.corrections.length} pending)`}
        description="Approving updates the attendance record."
      >
        {pending.corrections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending corrections.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {pending.corrections.map((c) => (
              <li key={c.id} className="space-y-2 p-3" data-testid="pending-correction">
                <div className="text-sm font-medium">{who(c.student)}</div>
                <div className="text-sm">
                  {c.session.course.code} · {formatDate(c.session.date)}{" "}
                  {minutesToHHMM(c.session.startMinute)} ·{" "}
                  {c.attendanceRecord?.status.toLowerCase() ?? "?"} →{" "}
                  <strong>{c.requestedStatus.toLowerCase()}</strong>
                </div>
                <p className="text-sm text-muted-foreground">{c.reason}</p>
                <ReviewControls requestId={c.id} action={reviewCorrectionAction} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recently decided">
        {decided.leaves.length + decided.corrections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {[
              ...decided.leaves.map((l) => ({
                id: l.id,
                at: l.reviewedAt ?? l.updatedAt,
                status: l.status,
                text: `Leave ${formatDate(l.fromDate)}–${formatDate(l.toDate)} · ${who(l.student)}`,
                by: l.reviewedBy?.name,
                note: l.reviewerNote,
              })),
              ...decided.corrections.map((c) => ({
                id: c.id,
                at: c.reviewedAt ?? c.updatedAt,
                status: c.status,
                text: `Correction ${c.session.course.code} ${formatDate(c.session.date)} → ${c.requestedStatus.toLowerCase()} · ${who(c.student)}`,
                by: c.reviewedBy?.name,
                note: c.reviewerNote,
              })),
            ]
              .sort((a, b) => b.at.getTime() - a.at.getTime())
              .slice(0, 50)
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 p-3">
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status.toLowerCase()}</Badge>
                  <span className="flex-1">{r.text}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.by ? `${r.by} · ` : ""}
                    {formatDateTime(r.at)}
                    {r.note ? ` · “${r.note}”` : ""}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

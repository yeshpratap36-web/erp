import type { Metadata } from "next";
import {
  cancelRequestAction,
  createCorrectionAction,
  createLeaveAction,
} from "@/app/actions/communication";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ActionForm } from "@/components/forms/action-form";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, SelectField, TextareaField } from "@/components/forms/field";
import { Badge } from "@/components/ui/badge";
import { ownStudentId } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { CORRECTION_WINDOW_DAYS } from "@/lib/communication/rules";
import { APP_TIMEZONE } from "@/lib/config";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { listRequests } from "@/lib/services/requests";
import { addDays, dateKey, minutesToHHMM, nowIn } from "@/lib/time";

export const metadata: Metadata = { title: "Requests" };

const STATUS_VARIANT = {
  APPROVED: "secondary",
  REJECTED: "destructive",
  CANCELLED: "outline",
  PENDING: "outline",
} as const;

export default async function StudentRequestsPage() {
  const user = await requireRole("STUDENT");
  const studentId = ownStudentId(user);
  const today = nowIn(APP_TIMEZONE).date;

  const [pending, decided, disputable] = await Promise.all([
    listRequests(user, "PENDING"),
    listRequests(user, "DECIDED"),
    // Confirmed records from the last 30 days that aren't already "present".
    db.attendanceRecord.findMany({
      where: {
        studentId,
        status: { not: "PRESENT" },
        session: {
          attendanceState: "FINALIZED",
          date: { gte: addDays(today, -CORRECTION_WINDOW_DAYS) },
        },
      },
      orderBy: [{ session: { date: "desc" } }, { session: { startMinute: "desc" } }],
      take: 60,
      select: {
        status: true,
        session: {
          select: { id: true, date: true, startMinute: true, course: { select: { code: true } } },
        },
      },
    }),
  ]);

  const all = [
    ...pending.leaves.map((l) => ({
      kind: "leave" as const,
      ...l,
      label: `Leave ${formatDate(l.fromDate)} – ${formatDate(l.toDate)}`,
    })),
    ...pending.corrections.map((c) => ({
      kind: "correction" as const,
      ...c,
      label: `${c.session.course.code} on ${formatDate(c.session.date)}: ${c.attendanceRecord?.status.toLowerCase()} → ${c.requestedStatus.toLowerCase()}`,
    })),
    ...decided.leaves.map((l) => ({
      kind: "leave" as const,
      ...l,
      label: `Leave ${formatDate(l.fromDate)} – ${formatDate(l.toDate)}`,
    })),
    ...decided.corrections.map((c) => ({
      kind: "correction" as const,
      ...c,
      label: `${c.session.course.code} on ${formatDate(c.session.date)}: → ${c.requestedStatus.toLowerCase()}`,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="space-y-6">
      <PageHeader title="Requests" description="Your teachers are notified and will review them." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Apply for leave"
          description="Approved leave marks your absences in that period as excused."
        >
          <ActionForm
            action={createLeaveAction}
            submitLabel="Send request"
            className="sm:grid-cols-2"
          >
            <Field
              name="fromDate"
              label="From"
              type="date"
              min={dateKey(addDays(today, -7))}
              required
            />
            <Field
              name="toDate"
              label="To"
              type="date"
              min={dateKey(addDays(today, -7))}
              required
            />
            <div className="sm:col-span-2">
              <TextareaField name="reason" label="Reason" rows={3} maxLength={1000} required />
            </div>
          </ActionForm>
        </Section>

        <Section
          title="Correct an attendance record"
          description={`For classes in the last ${CORRECTION_WINDOW_DAYS} days where you weren't marked present.`}
        >
          {disputable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              There are no records you can dispute right now.
            </p>
          ) : (
            <ActionForm action={createCorrectionAction} submitLabel="Send request">
              <SelectField
                name="sessionId"
                label="Class"
                placeholder="Choose…"
                options={disputable.map((r) => ({
                  value: r.session.id,
                  label: `${formatDate(r.session.date)} ${minutesToHHMM(r.session.startMinute)} · ${r.session.course.code} · marked ${r.status.toLowerCase()}`,
                }))}
                required
              />
              <SelectField
                name="requestedStatus"
                label="Should have been"
                options={[
                  { value: "PRESENT", label: "Present" },
                  { value: "LATE", label: "Late" },
                  { value: "EXCUSED", label: "Excused" },
                ]}
                defaultValue="PRESENT"
              />
              <TextareaField
                name="reason"
                label="What happened?"
                rows={3}
                maxLength={1000}
                required
              />
            </ActionForm>
          )}
        </Section>
      </div>

      <Section title="My requests">
        {all.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {all.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 p-3 text-sm"
                data-testid="my-request"
              >
                <Badge variant={STATUS_VARIANT[r.status]}>{r.status.toLowerCase()}</Badge>
                <span className="flex-1">{r.label}</span>
                <span className="text-xs text-muted-foreground">
                  {r.reviewedBy ? `${r.reviewedBy.name} · ` : ""}
                  {formatDateTime(r.reviewedAt ?? r.createdAt)}
                  {r.reviewerNote ? ` · “${r.reviewerNote}”` : ""}
                </span>
                {r.status === "PENDING" && (
                  <ConfirmAction
                    action={cancelRequestAction}
                    fields={{ requestId: r.id, kind: r.kind }}
                    label="Cancel"
                    confirm="Cancel this request?"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

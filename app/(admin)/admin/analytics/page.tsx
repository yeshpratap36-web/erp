import type { Metadata } from "next";
import Link from "next/link";
import { AlertOctagonIcon, AlertTriangleIcon } from "lucide-react";
import { z } from "zod";
import { DataTable } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/page-header";
import { BarList } from "@/components/charts/bar-list";
import { LineChart } from "@/components/charts/line-chart";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { requirePermission } from "@/lib/auth/session";
import { APP_TIMEZONE } from "@/lib/config";
import { db } from "@/lib/db";
import { termAnalytics } from "@/lib/services/analytics";
import { nowIn, startOfWeek } from "@/lib/time";

export const metadata: Metadata = { title: "Analytics" };

const querySchema = z.object({ semesterId: z.string().max(40).optional().catch(undefined) });
const weekFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** Status shown with icon + label, never color alone. */
function RiskBadge({ level }: { level: "high" | "medium" }) {
  const Icon = level === "high" ? AlertOctagonIcon : AlertTriangleIcon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <Icon
        className="size-4"
        style={{ color: level === "high" ? "var(--status-critical)" : "var(--status-serious)" }}
        aria-hidden
      />
      {level === "high" ? "High" : "Medium"}
    </span>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  await requirePermission("analytics:read:any");
  const terms = await db.semester.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, isCurrent: true },
  });
  const { semesterId: requested } = querySchema.parse(await searchParams);
  const term = terms.find((t) => t.id === requested) ?? terms.find((t) => t.isCurrent) ?? terms[0];
  if (!term) return <PageHeader title="Analytics" description="Create an academic term first." />;

  const a = await termAnalytics(term.id);
  const currentWeek = startOfWeek(nowIn(APP_TIMEZONE).date);
  const tiles = [
    {
      label: "Overall attendance",
      value: a.overview.attendancePercent === null ? "—" : `${a.overview.attendancePercent}%`,
    },
    { label: `Students below ${a.threshold}%`, value: a.overview.belowThreshold },
    { label: "At risk (high)", value: a.overview.atRiskHigh },
    {
      label: "Average marks so far",
      value:
        a.overview.averageMarks === null
          ? "—"
          : `${a.overview.averageMarks}% (${a.overview.averageGrade})`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`${term.name} · ${a.overview.students} students`}
        actions={
          <form method="get" className="flex gap-2">
            <NativeSelect name="semesterId" defaultValue={term.id} aria-label="Term">
              {terms.map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.name}
                  {t.isCurrent ? " (current)" : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" variant="secondary">
              Show
            </Button>
          </form>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border p-4">
            <div className="text-sm text-muted-foreground">{t.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>

      <Section title="Attendance trend">
        {a.weekly.length === 0 ? (
          <p className="text-sm text-muted-foreground">No confirmed attendance this term yet.</p>
        ) : (
          <LineChart
            title="Weekly attendance, all classes"
            data={a.weekly.map((w) => ({
              // A week that hasn't ended yet is labeled, so a dip from a handful of classes isn't misread.
              label: `${weekFmt.format(w.week)}${w.week >= currentWeek ? " (so far)" : ""}`,
              value: w.percent,
            }))}
            min={Math.max(
              0,
              Math.floor(Math.min(...a.weekly.map((w) => w.percent), a.threshold) / 10) * 10 - 10,
            )}
            reference={{ value: a.threshold, label: `${a.threshold}% threshold` }}
          />
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Attendance by department">
          <BarList
            title="Attendance %"
            data={a.departments.map((d) => ({ label: d.code, value: d.attendancePercent }))}
            reference={{ value: a.threshold, label: `${a.threshold}% threshold` }}
          />
        </Section>
        <Section title="Marks by department">
          <BarList
            title="Average course % so far"
            data={a.departments.map((d) => ({ label: d.code, value: d.averageMarks }))}
          />
        </Section>
      </div>

      <Section
        title={`At-risk students (${a.atRisk.length})`}
        description={`Attendance below ${a.threshold}% and/or below the ${a.passMark}% pass mark in a course (all marks entered so far). High = both.`}
        actions={
          a.atRisk.length > 0 && (
            <a
              href={`/api/admin/analytics/at-risk?semesterId=${term.id}`}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
              download
            >
              Download CSV
            </a>
          )
        }
      >
        <DataTable
          rows={a.atRisk}
          rowKey={(s) => s.id}
          empty="No students are at risk right now."
          columns={[
            { header: "Risk", cell: (s) => <RiskBadge level={s.level!} /> },
            {
              header: "Student",
              cell: (s) => (
                <Link
                  href={`/admin/students/${s.userId}`}
                  className="underline-offset-4 hover:underline"
                >
                  <span className="font-medium">{s.rollNumber}</span> {s.name}
                </Link>
              ),
            },
            { header: "Section", cell: (s) => s.section, hideOnMobile: true },
            {
              header: "Attendance",
              cell: (s) =>
                s.attendancePercent === null
                  ? "—"
                  : `${s.attendancePercent}%${s.lowAttendance ? " (low)" : ""}`,
            },
            {
              header: "Below pass mark",
              cell: (s) =>
                s.failing.length ? s.failing.map((f) => `${f.code} ${f.percent}%`).join(", ") : "—",
              hideOnMobile: true,
            },
          ]}
        />
      </Section>
    </div>
  );
}

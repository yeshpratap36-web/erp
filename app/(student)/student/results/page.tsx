import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ownStudentId } from "@/lib/auth/scope";
import { requireRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { studentResults } from "@/lib/services/results";

export const metadata: Metadata = { title: "Results" };

export default async function StudentResultsPage() {
  const user = await requireRole("STUDENT");
  const { current, terms, cgpa, creditsEarned } = await studentResults(ownStudentId(user));

  return (
    <div className="space-y-6">
      <PageHeader title="Results" />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <div className="text-sm text-muted-foreground">CGPA</div>
          <div className="text-3xl font-semibold tabular-nums" data-testid="cgpa">
            {cgpa?.toFixed(2) ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            across {terms.length} term{terms.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-muted-foreground">Latest SGPA</div>
          <div className="text-3xl font-semibold tabular-nums">
            {terms.at(-1)?.sgpa?.toFixed(2) ?? "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {terms.at(-1)?.term.name ?? "No results yet"}
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="text-sm text-muted-foreground">Credits earned</div>
          <div className="text-3xl font-semibold tabular-nums">{creditsEarned}</div>
        </div>
      </div>

      <Section
        title="This term"
        description="Marks appear once your teacher publishes them. Percentages are over the assessments published so far."
      >
        {current.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You aren&apos;t enrolled in any course this term.
          </p>
        ) : (
          <ul className="space-y-3">
            {current.map((c) => (
              <li key={c.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{c.code}</span>{" "}
                    <span className="text-muted-foreground">{c.name}</span>
                  </span>
                  <span className="text-sm tabular-nums">
                    {c.progress.percent === null ? "No marks yet" : `${c.progress.percent}% so far`}
                    <span className="text-muted-foreground">
                      {" "}
                      · {c.progress.weightGraded}% assessed
                    </span>
                  </span>
                </div>
                {c.exams.length > 0 && (
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      {c.exams.map((e) => (
                        <tr key={e.id} className="border-t">
                          <td className="py-1.5">{e.name}</td>
                          <td className="hidden py-1.5 text-muted-foreground sm:table-cell">
                            {e.date ? formatDate(e.date) : ""}
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground">
                            {e.weightage}%
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {!e.mark
                              ? "—"
                              : e.mark.isAbsent
                                ? "Absent"
                                : `${e.mark.marksObtained} / ${e.maxMarks}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {[...terms].reverse().map((t) => (
        <Section
          key={t.term.id}
          title={t.term.name}
          description={`SGPA ${t.sgpa?.toFixed(2) ?? "—"} · ${t.creditsEarned}/${t.creditsAttempted} credits earned`}
        >
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Course</th>
                <th className="hidden py-1 font-medium sm:table-cell">Name</th>
                <th className="py-1 text-right font-medium">Credits</th>
                <th className="py-1 text-right font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {t.courses.map((c) => (
                <tr key={c.code} className="border-t">
                  <td className="py-1.5 font-medium">{c.code}</td>
                  <td className="hidden py-1.5 text-muted-foreground sm:table-cell">{c.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{c.credits}</td>
                  <td className="py-1.5 text-right">
                    {c.isPass ? (
                      c.gradeLetter
                    ) : (
                      <Badge variant="destructive">{c.gradeLetter} · not passed</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ))}
    </div>
  );
}

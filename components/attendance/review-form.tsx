"use client";

import { useActionState, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

type Status = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
const STATUSES: { value: Status; label: string; short: string }[] = [
  { value: "PRESENT", label: "Present", short: "P" },
  { value: "LATE", label: "Late", short: "L" },
  { value: "ABSENT", label: "Absent", short: "A" },
  { value: "EXCUSED", label: "Excused", short: "E" },
];

export type ReviewFormStudent = {
  id: string;
  rollNumber: string;
  name: string;
  faceStatus: "ENROLLED" | "OPTED_OUT" | "NOT_ENROLLED";
  proposal: {
    source: "FACE" | "UNCERTAIN" | "NONE";
    similarity: number | null;
    suggested: "PRESENT" | "ABSENT" | null;
  };
  recorded: Status | null;
};

function SourceBadge({ s, hadPhotos }: { s: ReviewFormStudent; hadPhotos: boolean }) {
  if (s.proposal.source === "FACE")
    return <Badge className="bg-emerald-600">Face {s.proposal.similarity?.toFixed(2)}</Badge>;
  if (s.proposal.source === "UNCERTAIN")
    return <Badge className="bg-amber-500">Uncertain {s.proposal.similarity?.toFixed(2)}</Badge>;
  if (!hadPhotos) return null;
  if (s.faceStatus === "OPTED_OUT")
    return <Badge variant="outline">Opted out — mark manually</Badge>;
  if (s.faceStatus === "NOT_ENROLLED") return <Badge variant="outline">No face enrolled</Badge>;
  return <Badge variant="outline">Not detected</Badge>;
}

/**
 * The faculty member's decision for every student. Defaults: previously confirmed status,
 * else the face proposal. Uncertain matches have no default and must be decided.
 */
export function ReviewForm({
  sessionId,
  students,
  hadPhotos,
  finalized,
  action,
}: {
  sessionId: string;
  students: ReviewFormStudent[];
  hadPhotos: boolean;
  finalized: boolean;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [statuses, setStatuses] = useState<Record<string, Status | undefined>>(() =>
    Object.fromEntries(
      students.map((s) => [
        s.id,
        s.recorded ?? (hadPhotos ? (s.proposal.suggested ?? undefined) : undefined),
      ]),
    ),
  );
  const undecided = students.filter((s) => !statuses[s.id]).length;
  const present = students.filter(
    (s) => statuses[s.id] === "PRESENT" || statuses[s.id] === "LATE",
  ).length;
  const setAll = (status: Status) =>
    setStatuses((prev) => Object.fromEntries(students.map((s) => [s.id, prev[s.id] ?? status])));

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span data-testid="review-summary">
          {present} present · {students.length - present - undecided} absent/excused
          {undecided > 0 && <strong className="text-amber-600"> · {undecided} to decide</strong>}
        </span>
        {undecided > 0 && (
          <span className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAll("PRESENT")}>
              Rest present
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAll("ABSENT")}>
              Rest absent
            </Button>
          </span>
        )}
      </div>

      <ul className="divide-y rounded-lg border">
        {students.map((s) => {
          const current = statuses[s.id];
          return (
            <li
              key={s.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-2 p-3",
                !current && "bg-amber-50 dark:bg-amber-950/20",
              )}
              data-testid={`student-${s.rollNumber}`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {s.rollNumber} <span className="font-normal text-muted-foreground">{s.name}</span>
                </div>
                <SourceBadge s={s} hadPhotos={hadPhotos} />
              </div>
              <fieldset className="flex gap-1" aria-label={`Attendance for ${s.name}`}>
                {STATUSES.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "cursor-pointer rounded-md border px-2.5 py-1 text-sm select-none",
                      current === opt.value
                        ? opt.value === "ABSENT"
                          ? "border-destructive bg-destructive text-white"
                          : "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                    title={opt.label}
                  >
                    <input
                      type="radio"
                      name={`status:${s.id}`}
                      value={opt.value}
                      checked={current === opt.value}
                      onChange={() => setStatuses((prev) => ({ ...prev, [s.id]: opt.value }))}
                      className="sr-only"
                    />
                    <span className="sm:hidden">{opt.short}</span>
                    <span className="hidden sm:inline">{opt.label}</span>
                  </label>
                ))}
              </fieldset>
            </li>
          );
        })}
      </ul>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && state.message && (
        <Alert data-testid="form-success">
          <CheckCircle2Icon />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          pendingLabel="Saving…"
          className={cn(undecided > 0 && "pointer-events-none opacity-50")}
        >
          {finalized ? "Save changes" : "Confirm attendance"}
        </SubmitButton>
        {undecided > 0 && (
          <span className="text-sm text-muted-foreground">Decide every student first.</span>
        )}
      </div>
    </form>
  );
}

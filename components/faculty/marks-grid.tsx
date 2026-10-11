"use client";

import { useActionState, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/lib/actions";

export type GridStudent = {
  id: string;
  rollNumber: string;
  name: string;
  marks: number | null;
  absent: boolean;
};

/** Marks entry. Inputs are controlled so a failed save never wipes what was typed. */
export function MarksGrid({
  examId,
  maxMarks,
  students,
  action,
}: {
  examId: string;
  maxMarks: number;
  students: GridStudent[];
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      students.map((s) => [
        s.id,
        { marks: s.marks === null ? "" : String(s.marks), absent: s.absent },
      ]),
    ),
  );
  const missing = students.filter((s) => !values[s.id].absent && values[s.id].marks === "").length;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="examId" value={examId} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="p-2 font-medium">Roll no.</th>
              <th className="hidden p-2 font-medium sm:table-cell">Name</th>
              <th className="p-2 font-medium">Marks / {maxMarks}</th>
              <th className="p-2 font-medium">Absent</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const v = values[s.id];
              const n = Number(v.marks);
              const invalid = v.marks !== "" && (!Number.isFinite(n) || n < 0 || n > maxMarks);
              return (
                <tr
                  key={s.id}
                  className="border-b last:border-0"
                  data-testid={`marks-${s.rollNumber}`}
                >
                  <td className="p-2 font-medium">{s.rollNumber}</td>
                  <td className="hidden p-2 text-muted-foreground sm:table-cell">{s.name}</td>
                  <td className="p-2">
                    <input
                      name={`mark:${s.id}`}
                      inputMode="decimal"
                      aria-label={`Marks for ${s.name}`}
                      aria-invalid={invalid || undefined}
                      disabled={v.absent}
                      value={v.absent ? "" : v.marks}
                      onChange={(e) =>
                        setValues((p) => ({ ...p, [s.id]: { ...p[s.id], marks: e.target.value } }))
                      }
                      className="w-20 rounded-md border border-input bg-transparent px-2 py-1 tabular-nums disabled:opacity-40 aria-invalid:border-destructive"
                    />
                    {/* disabled inputs aren't submitted; keep the key present so the student is saved as absent */}
                    {v.absent && <input type="hidden" name={`mark:${s.id}`} value="" />}
                  </td>
                  <td className="p-2">
                    <input
                      type="checkbox"
                      name={`absent:${s.id}`}
                      aria-label={`${s.name} was absent`}
                      checked={v.absent}
                      onChange={(e) =>
                        setValues((p) => ({
                          ...p,
                          [s.id]: { ...p[s.id], absent: e.target.checked },
                        }))
                      }
                      className="size-4 accent-primary"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
        <SubmitButton pendingLabel="Saving…">Save marks</SubmitButton>
        <span className="text-sm text-muted-foreground">
          {missing ? `${missing} not entered yet` : "All students have marks"}
        </span>
      </div>
    </form>
  );
}

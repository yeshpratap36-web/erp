"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/actions";

/** Upload `roll_number,marks` (marks may be "AB"). Validated in full before anything is saved. */
export function MarksImport({
  examId,
  action,
}: {
  examId: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [csv, setCsv] = useState("");
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="examId" value={examId} />
      <input type="hidden" name="csv" value={csv} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept=".csv,text/csv"
          className="max-w-xs"
          aria-label="Marks CSV"
          data-testid="marks-csv"
          onChange={async (e) => setCsv((await e.target.files?.[0]?.text()) ?? "")}
        />
        <Button type="submit" variant="secondary" disabled={!csv || pending}>
          {pending ? "Importing…" : "Import CSV"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Columns <code>roll_number</code>, <code>marks</code> — use <code>AB</code> for absent.
      </p>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && state.message && <p className="text-sm">{state.message}</p>}
    </form>
  );
}

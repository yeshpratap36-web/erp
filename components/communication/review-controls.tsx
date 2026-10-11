"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/actions";

/** Approve / reject with an optional note (the clicked button's value is the decision). */
export function ReviewControls({
  requestId,
  action,
}: {
  requestId: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  if (state.ok) return <p className="text-sm font-medium">{state.message}</p>;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Input
        name="note"
        placeholder="Note (optional)"
        maxLength={500}
        className="h-8 max-w-56"
        aria-label="Note to the student"
      />
      <Button type="submit" name="decision" value="APPROVED" size="sm" disabled={pending}>
        Approve
      </Button>
      <Button
        type="submit"
        name="decision"
        value="REJECTED"
        size="sm"
        variant="outline"
        disabled={pending}
      >
        Reject
      </Button>
      {state.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

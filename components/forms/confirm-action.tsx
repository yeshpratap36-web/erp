"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";

/**
 * A single-button form for destructive or account actions (delete, deactivate, reset…).
 * Asks for confirmation, posts hidden fields, and shows the action's error inline.
 */
export function ConfirmAction<T>({
  action,
  fields,
  label,
  pendingLabel,
  confirm,
  variant = "outline",
  renderResult,
}: {
  action: (state: ActionState<T>, formData: FormData) => Promise<ActionState<T>>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  variant?: "outline" | "destructive" | "secondary" | "default";
  renderResult?: (data: T) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState<T>);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="grid gap-2"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant} size="sm" disabled={pending} className="w-fit">
        {pending ? (pendingLabel ?? `${label}…`) : label}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && state.data !== undefined && renderResult?.(state.data)}
    </form>
  );
}

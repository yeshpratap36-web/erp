"use client";

import { useActionState, useRef } from "react";
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
  prompt,
}: {
  action: (state: ActionState<T>, formData: FormData) => Promise<ActionState<T>>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  variant?: "outline" | "destructive" | "secondary" | "default";
  renderResult?: (data: T) => React.ReactNode;
  /** Ask for a short text (e.g. a reason) and submit it as `name`. Cancelling the prompt aborts. */
  prompt?: { name: string; message: string };
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState<T>);
  const promptInput = useRef<HTMLInputElement>(null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (prompt) {
          const value = window.prompt(prompt.message);
          if (value === null) return e.preventDefault();
          promptInput.current!.value = value;
        } else if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
        }
      }}
      className="grid gap-2"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {prompt && <input ref={promptInput} type="hidden" name={prompt.name} defaultValue="" />}
      <Button type="submit" variant={variant} size="sm" disabled={pending} className="w-fit">
        {pending ? (pendingLabel ?? `${label}…`) : label}
      </Button>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && state.data !== undefined && renderResult?.(state.data)}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormStateContext } from "@/components/forms/form-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/lib/actions";
import { cn } from "@/lib/utils";

type FormAction<T> = (state: ActionState<T>, formData: FormData) => Promise<ActionState<T>>;

/**
 * A form bound to a Server Action via useActionState. Shows form-level errors/success,
 * and provides field errors + submitted values to <Field>/<SelectField> through context.
 * `renderResult` displays action data (e.g. a one-time password) after success.
 */
export function ActionForm<T>({
  action,
  children,
  submitLabel = "Save",
  pendingLabel = "Saving…",
  className,
  submitClassName,
  renderResult,
}: {
  action: FormAction<T>;
  children: React.ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  submitClassName?: string;
  renderResult?: (data: T) => React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState<T>);

  return (
    <FormStateContext value={state as ActionState<unknown>}>
      <form action={formAction} className={cn("grid gap-4", className)} noValidate>
        {state.error && (
          <Alert variant="destructive" data-testid="form-error" className="col-span-full">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state.ok && state.message && (
          <Alert data-testid="form-success" className="col-span-full">
            <CheckCircle2Icon />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {state.ok && state.data !== undefined && (
          <div className="col-span-full">{renderResult?.(state.data)}</div>
        )}
        {children}
        <div className="col-span-full">
          <SubmitButton pendingLabel={pendingLabel} className={submitClassName}>
            {submitLabel}
          </SubmitButton>
        </div>
      </form>
    </FormStateContext>
  );
}

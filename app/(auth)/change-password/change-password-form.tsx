"use client";

import { useActionState } from "react";
import { Field } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { initialActionState } from "@/lib/actions";
import { PASSWORD_RULES } from "@/lib/validators/auth";
import { changePasswordAction } from "../actions";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initialActionState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {state.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Field
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.currentPassword}
      />
      <Field
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.newPassword}
        hint={
          <ul className="list-disc space-y-0.5 pl-4">
            {PASSWORD_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        }
      />
      <Field
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Save password
      </SubmitButton>
    </form>
  );
}

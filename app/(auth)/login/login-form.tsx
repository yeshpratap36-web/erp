"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Field } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { initialActionState } from "@/lib/actions";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialActionState);
  const callbackUrl = useSearchParams().get("callbackUrl") ?? "";

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {state.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <Field
        name="identifier"
        label="Login ID or email"
        defaultValue={state.values?.identifier}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        errors={state.fieldErrors?.identifier}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        Forgot your password? Contact the college administrator to reset it.
      </p>
    </form>
  );
}

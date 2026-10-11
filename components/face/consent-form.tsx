"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/lib/actions";
import { consentSections, consentVersion } from "@/lib/biometrics/consent";

export function ConsentForm({
  action,
  deletesPhotos,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Current face.deleteRawPhotosAfterEnrollment setting — decides the retention wording. */
  deletesPhotos: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border p-3 text-sm">
        {consentSections(deletesPhotos).map((s) => (
          <section key={s.title}>
            <h3 className="font-medium">{s.title}</h3>
            <p className="text-muted-foreground">{s.body}</p>
          </section>
        ))}
        <p className="text-xs text-muted-foreground">
          Consent version {consentVersion(deletesPhotos)}
        </p>
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="agree"
          className="mt-0.5 size-4 accent-primary"
          aria-describedby="agree-error"
        />
        <span>
          I have read the above and consent to the college processing my facial data for attendance.
        </span>
      </label>
      {state.fieldErrors?.agree && (
        <p id="agree-error" className="text-sm text-destructive">
          {state.fieldErrors.agree[0]}
        </p>
      )}
      <SubmitButton className="w-full" pendingLabel="Saving…">
        I agree — continue
      </SubmitButton>
      <p className="text-xs text-muted-foreground">
        Don&apos;t want to use face attendance? Contact the college office — your attendance can be
        marked manually.
      </p>
    </form>
  );
}

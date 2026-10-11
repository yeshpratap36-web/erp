"use client";

import { useActionState } from "react";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/lib/actions";
import { consentSections, consentVersion } from "@/lib/biometrics/consent";

export function ConsentForm({
  action,
  declineAction,
  deletesPhotos,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Offer "I don't consent" (finishes without face enrollment). */
  declineAction?: (state: ActionState) => Promise<ActionState>;
  /** Current face.deleteRawPhotosAfterEnrollment setting — decides the retention wording. */
  deletesPhotos: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <div className="space-y-3">
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
            I have read the above and consent to the college processing my facial data for
            attendance.
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
      </form>
      {declineAction && (
        <div className="space-y-1 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Prefer not to use face attendance? That&apos;s fine — your teachers will mark your
            attendance manually, and you can opt in later from your profile.
          </p>
          <ConfirmAction
            action={declineAction}
            fields={{}}
            label="I don't consent"
            pendingLabel="Saving…"
            confirm="Continue without face attendance? Your attendance will be marked manually. You can opt in later from your profile."
          />
        </div>
      )}
    </div>
  );
}

"use server";

import { redirect } from "next/navigation";
import { unstable_update } from "@/auth";
import type { ActionState } from "@/lib/actions";
import { FACE_ENROLLMENT_PATH } from "@/lib/auth/routing";
import { requireSession } from "@/lib/auth/session";
import { HttpError } from "@/lib/errors";
import { completeEnrollment, declineConsent, giveConsent } from "@/lib/services/face-enrollment";

// These run during onboarding, so they can't use formAction() (which requires a fully
// onboarded user). Each one re-checks the session and the student's state itself.

export async function giveConsentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireSession();
  if (user.role !== "STUDENT") return { error: "Only students enroll their face." };
  if (formData.get("agree") !== "on") {
    return { fieldErrors: { agree: ["Please tick the box to give your consent."] } };
  }
  await giveConsent(user);
  await unstable_update({}); // refresh the JWT's onboarding step from the DB
  redirect(user.onboardingStep === "COMPLETE" ? "/student/face" : FACE_ENROLLMENT_PATH);
}

export async function completeEnrollmentAction(_prev: ActionState): Promise<ActionState> {
  const user = await requireSession();
  try {
    await completeEnrollment(user);
  } catch (err) {
    if (err instanceof HttpError) return { error: err.message };
    throw err;
  }
  await unstable_update({});
  redirect("/student");
}

/** "I don't consent" — finish onboarding without face enrollment. */
export async function declineConsentAction(_prev: ActionState): Promise<ActionState> {
  const user = await requireSession();
  if (user.role !== "STUDENT") return { error: "Only students enroll their face." };
  await declineConsent(user);
  await unstable_update({});
  redirect("/student");
}

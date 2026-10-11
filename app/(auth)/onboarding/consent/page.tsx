import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingGate } from "@/components/auth/onboarding-gate";
import { ConsentForm } from "@/components/face/consent-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONSENT_PATH } from "@/lib/auth/routing";
import { getSetting } from "@/lib/settings.server";
import { giveConsentAction } from "../actions";

export const metadata: Metadata = { title: "Biometric consent" };

export default function ConsentPage() {
  return (
    <Suspense fallback={<Card className="h-96 animate-pulse" />}>
      <OnboardingGate path={CONSENT_PATH}>
        {async () => (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Face attendance consent</CardTitle>
              <CardDescription>
                Step 2 of 3. Please read this before we take your photos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConsentForm
                action={giveConsentAction}
                deletesPhotos={await getSetting("face.deleteRawPhotosAfterEnrollment")}
              />
            </CardContent>
          </Card>
        )}
      </OnboardingGate>
    </Suspense>
  );
}

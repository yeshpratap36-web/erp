import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingGate } from "@/components/auth/onboarding-gate";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CONSENT_PATH } from "@/lib/auth/routing";

export const metadata: Metadata = { title: "Biometric consent" };

// Placeholder — the consent form is built in Phase 5.
export default function ConsentPage() {
  return (
    <Suspense fallback={<Card className="h-48 animate-pulse" />}>
      <OnboardingGate path={CONSENT_PATH}>
        {() => (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Biometric consent</CardTitle>
              <CardDescription>
                Step 2 of 3. The consent form will be available here soon.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </OnboardingGate>
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingGate } from "@/components/auth/onboarding-gate";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FACE_ENROLLMENT_PATH } from "@/lib/auth/routing";

export const metadata: Metadata = { title: "Face enrollment" };

// Placeholder — guided face capture is built in Phase 5.
export default function FaceEnrollmentPage() {
  return (
    <Suspense fallback={<Card className="h-48 animate-pulse" />}>
      <OnboardingGate path={FACE_ENROLLMENT_PATH}>
        {() => (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Face enrollment</CardTitle>
              <CardDescription>
                Step 3 of 3. Face capture will be available here soon.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </OnboardingGate>
    </Suspense>
  );
}

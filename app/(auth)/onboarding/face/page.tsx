import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingGate } from "@/components/auth/onboarding-gate";
import { FaceEnrollment } from "@/components/face/face-enrollment";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FACE_ENROLLMENT_PATH } from "@/lib/auth/routing";
import { pendingAngles } from "@/lib/face/embeddings";
import { completeEnrollmentAction } from "../actions";

export const metadata: Metadata = { title: "Face enrollment" };

export default function FaceEnrollmentPage() {
  return (
    <Suspense fallback={<Card className="h-96 animate-pulse" />}>
      <OnboardingGate path={FACE_ENROLLMENT_PATH}>
        {async (user) => (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Face enrollment</CardTitle>
              <CardDescription>
                Step 3 of 3. Take five photos in good light, with only you in the frame. No glasses
                glare, hats or masks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FaceEnrollment
                initialCompleted={await pendingAngles(user.id)}
                finishAction={completeEnrollmentAction}
              />
            </CardContent>
          </Card>
        )}
      </OnboardingGate>
    </Suspense>
  );
}

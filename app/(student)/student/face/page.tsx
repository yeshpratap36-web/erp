import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ConsentForm } from "@/components/face/consent-form";
import { FaceEnrollment } from "@/components/face/face-enrollment";
import { requireRole } from "@/lib/auth/session";
import { pendingAngles } from "@/lib/face/embeddings";
import { enrollmentMode, enrollmentStatus } from "@/lib/services/face-enrollment";
import { getSetting } from "@/lib/settings.server";
import { completeEnrollmentAction, giveConsentAction } from "../../../(auth)/onboarding/actions";

export const metadata: Metadata = { title: "Face enrollment" };

/** Re-enrollment for onboarded students, only when an admin or faculty member allowed it. */
export default async function StudentFacePage() {
  const user = await requireRole("STUDENT");
  const [mode, status, deletesPhotos] = await Promise.all([
    enrollmentMode(user),
    enrollmentStatus(user.id),
    getSetting("face.deleteRawPhotosAfterEnrollment"),
  ]);
  const allowed = user.studentProfile?.faceReenrollAllowed ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Face enrollment"
        description={
          status.active
            ? "Your face is enrolled for attendance."
            : "Your face is not enrolled — attendance is marked manually."
        }
        back={{ href: "/student/profile", label: "Profile" }}
      />
      {!allowed ? (
        <Section title="Retake photos">
          <p className="text-sm text-muted-foreground">
            To retake your photos, ask your teacher or the college office to enable re-enrollment
            for your account.
          </p>
        </Section>
      ) : !status.consent ? (
        <Section title="Consent" description="We need your consent before taking new photos.">
          <ConsentForm action={giveConsentAction} deletesPhotos={deletesPhotos} />
        </Section>
      ) : mode === "reenroll" ? (
        <Section
          title="Take new photos"
          description="Your current photos stay in use until you finish."
        >
          <FaceEnrollment
            initialCompleted={await pendingAngles(user.id)}
            finishAction={completeEnrollmentAction}
          />
        </Section>
      ) : null}
    </div>
  );
}

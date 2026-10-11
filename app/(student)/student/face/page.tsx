import type { Metadata } from "next";
import { PageHeader, Section } from "@/components/admin/page-header";
import { ConsentForm } from "@/components/face/consent-form";
import { FaceEnrollment } from "@/components/face/face-enrollment";
import { requireRole } from "@/lib/auth/session";
import { pendingAngles } from "@/lib/face/embeddings";
import { formatInstantDate } from "@/lib/format";
import { enrollmentMode, enrollmentStatus } from "@/lib/services/face-enrollment";
import { getSetting } from "@/lib/settings.server";
import { completeEnrollmentAction, giveConsentAction } from "../../../(auth)/onboarding/actions";

export const metadata: Metadata = { title: "Face enrollment" };

/**
 * Face enrollment for onboarded students:
 * - no active face data (opted out earlier, or data deleted) → consent, then enroll
 * - active face data → retaking photos needs permission from an admin or teacher
 */
export default async function StudentFacePage() {
  const user = await requireRole("STUDENT");
  const [mode, status, deletesPhotos] = await Promise.all([
    enrollmentMode(user),
    enrollmentStatus(user.id),
    getSetting("face.deleteRawPhotosAfterEnrollment"),
  ]);
  const enrolled = status.active > 0;

  const description = enrolled
    ? "Your face is enrolled for attendance."
    : status.optedOutAt
      ? `You opted out of face attendance on ${formatInstantDate(status.optedOutAt)}. Your attendance is marked manually.`
      : "Your face is not enrolled — your attendance is marked manually.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Face enrollment"
        description={description}
        back={{ href: "/student/profile", label: "Profile" }}
      />
      {enrolled && !user.studentProfile?.faceReenrollAllowed ? (
        <Section title="Retake photos">
          <p className="text-sm text-muted-foreground">
            To retake your photos, ask your teacher or the college office to enable re-enrollment
            for your account.
          </p>
        </Section>
      ) : !status.consent ? (
        <Section
          title={enrolled ? "Consent" : "Opt in to face attendance"}
          description="Face attendance is optional. We need your consent before taking photos."
        >
          <ConsentForm action={giveConsentAction} deletesPhotos={deletesPhotos} />
        </Section>
      ) : mode ? (
        <Section
          title={enrolled ? "Take new photos" : "Take your photos"}
          description={enrolled ? "Your current photos stay in use until you finish." : undefined}
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

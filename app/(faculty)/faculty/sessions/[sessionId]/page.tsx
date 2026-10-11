import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/page-header";
import { AutoRefresh } from "@/components/attendance/auto-refresh";
import { PhotoUploader } from "@/components/attendance/photo-uploader";
import { ReviewForm } from "@/components/attendance/review-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/session";
import { HttpError } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { sessionReview } from "@/lib/services/face-attendance";
import { sectionLabel } from "@/lib/services/timetable";
import { minutesToHHMM } from "@/lib/time";
import { finalizeAttendanceAction, retryPhotoAction } from "../../actions";

export const metadata: Metadata = { title: "Take attendance" };

export default async function SessionAttendancePage({
  params,
}: PageProps<"/faculty/sessions/[sessionId]">) {
  const user = await requireRole("FACULTY");
  const { sessionId } = await params;
  let review;
  try {
    review = await sessionReview(sessionId, user);
  } catch (err) {
    // Another faculty member's class looks exactly like a missing one.
    if (err instanceof HttpError && (err.status === 403 || err.status === 404)) notFound();
    throw err;
  }
  const { session, photos, students, unmatchedFaces } = review;
  const processing = photos.some((p) => p.status === "PENDING" || p.status === "PROCESSING");
  const finalized = session.attendanceState === "FINALIZED";
  const cancelled = session.status === "CANCELLED";
  const hadPhotos = photos.some((p) => p.status === "DONE");

  return (
    <div className="space-y-6">
      <AutoRefresh active={processing} />
      <PageHeader
        title={`${session.course.code} — ${session.course.name}`}
        description={`${sectionLabel(session.section)} · ${formatDate(session.date)} · ${minutesToHHMM(session.startMinute)}–${minutesToHHMM(session.endMinute)}${session.room ? ` · ${session.room}` : ""}`}
        back={{ href: "/faculty/timetable", label: "Timetable" }}
        actions={
          finalized ? (
            <Badge variant="secondary">Confirmed</Badge>
          ) : processing ? (
            <Badge variant="outline">Processing photos…</Badge>
          ) : null
        }
      />

      {cancelled ? (
        <Alert>
          <AlertDescription>This class was cancelled.</AlertDescription>
        </Alert>
      ) : (
        <>
          {finalized && (
            <Alert>
              <AlertDescription>
                Confirmed by {session.finalizedBy} on {formatDateTime(session.finalizedAt)}. Changes
                are saved as overrides and logged.
              </AlertDescription>
            </Alert>
          )}

          {!finalized && (
            <Section
              title="Face attendance"
              description="Optional. Upload photos of the class; matches are suggestions you confirm below. Photos are deleted once you confirm."
            >
              <PhotoUploader
                sessionId={session.id}
                photos={photos}
                canUpload={!processing}
                retryAction={retryPhotoAction}
              />
              {hadPhotos && unmatchedFaces > 0 && (
                <p className="text-sm text-muted-foreground">
                  {unmatchedFaces} face{unmatchedFaces === 1 ? " wasn't" : "s weren't"} recognized
                  as anyone enrolled in this class.
                </p>
              )}
            </Section>
          )}

          <Section
            title={`Students (${students.length})`}
            description={
              processing
                ? "Results will fill in when processing finishes. You can still mark attendance manually."
                : hadPhotos
                  ? "Check the suggestions — amber rows need your decision."
                  : "Mark each student, or upload photos above."
            }
          >
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No students are enrolled in this class.
              </p>
            ) : (
              // Re-mount when processing finishes so fresh suggestions become the defaults.
              <ReviewForm
                key={`${processing}-${photos.length}-${session.attendanceState}`}
                sessionId={session.id}
                students={students}
                hadPhotos={hadPhotos}
                finalized={finalized}
                action={finalizeAttendanceAction}
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

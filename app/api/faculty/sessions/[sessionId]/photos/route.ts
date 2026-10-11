import { after } from "next/server";
import { apiRoute } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { processPhotos, uploadPhotos } from "@/lib/services/face-attendance";

// Face processing continues after the response (see `after` below) within this budget.
export const maxDuration = 60;

/**
 * POST /api/faculty/sessions/:sessionId/photos — multipart `photos` (1–3 classroom images).
 * Stores them privately, responds immediately, then detects and matches faces in the
 * background. The review page polls until the session is ready.
 */
export const POST = apiRoute<undefined, { queued: number }, { sessionId: string }>(
  { permission: "attendance:take:assigned" },
  async ({ user, req, params }) => {
    const form = await req.formData().catch(() => null);
    const files = (form?.getAll("photos") ?? []).filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new HttpError(400, "invalid_input", "Attach at least one photo.");

    const queued = await uploadPhotos(params.sessionId, user, files);
    after(async () => {
      try {
        await processPhotos(params.sessionId, queued);
      } catch (err) {
        console.error("Background attendance processing failed", params.sessionId, err);
      }
    });
    return { queued: queued.length };
  },
);

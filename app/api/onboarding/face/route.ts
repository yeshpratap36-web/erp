import { z } from "zod";
import { FaceAngle } from "@/generated/prisma/enums";
import { apiRoute } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { addEnrollmentPhoto } from "@/lib/services/face-enrollment";

const angleSchema = z.enum(FaceAngle);

/**
 * POST /api/onboarding/face — multipart { angle, image }.
 * Used during first-login onboarding and for allowed re-enrollment; the service decides.
 * Returns which angles are done; never returns embeddings or photos.
 */
export const POST = apiRoute(
  { permission: "face:enroll:own", allowDuringOnboarding: true },
  async ({ user, req }) => {
    const form = await req.formData().catch(() => null);
    const angle = angleSchema.safeParse(form?.get("angle"));
    const image = form?.get("image");
    if (!angle.success) throw new HttpError(400, "invalid_input", "Unknown photo angle.");
    if (!(image instanceof File)) throw new HttpError(400, "invalid_input", "Attach a photo.");
    return addEnrollmentPhoto(user, angle.data, image);
  },
);

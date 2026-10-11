import "server-only";
import { randomUUID } from "node:crypto";
import { FaceAngle } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { consentVersion } from "@/lib/biometrics/consent";
import { db } from "@/lib/db";
import { forbidden, HttpError, notFound } from "@/lib/errors";
import { getFaceProvider } from "@/lib/face";
import {
  closestOtherUser,
  deleteAllEmbeddings,
  detachActivePhotos,
  pendingAngles,
  promotePending,
  savePendingEmbedding,
  similarityToPending,
} from "@/lib/face/embeddings";
import { FaceQualityError } from "@/lib/face/provider";
import { rateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request";
import { getSetting } from "@/lib/settings.server";
import { deletePrivateObjects, putPrivateObject } from "@/lib/storage";

export const ENROLLMENT_ANGLES: FaceAngle[] = [
  FaceAngle.FRONT,
  FaceAngle.LEFT,
  FaceAngle.RIGHT,
  FaceAngle.UP,
  FaceAngle.DOWN,
];

/** Photos of one person at slight angles stay above this (random strangers are ~0–0.25 with SFace). */
const SAME_PERSON_MIN = 0.3;
/** A new photo this close to another student's enrolled face is treated as the same person. */
const OTHER_PERSON_MAX = 0.55;

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * - onboarding: first-login step 3
 * - self: an onboarded student without active face data (opted out earlier, or data deleted)
 *   who has now consented — no permission needed to enroll for the first time
 * - reenroll: replacing existing face data, which an admin/faculty must allow
 */
export type EnrollmentMode = "onboarding" | "self" | "reenroll";

async function hasActiveConsent(userId: string) {
  const consent = await db.biometricConsent.findFirst({
    where: { userId, revokedAt: null },
    select: { id: true },
  });
  return consent !== null;
}

/** Whether this user may upload enrollment photos right now, and in which mode. */
export async function enrollmentMode(user: CurrentUser): Promise<EnrollmentMode | null> {
  if (user.role !== "STUDENT" || !user.studentProfile || user.mustChangePassword) return null;
  if (!(await hasActiveConsent(user.id))) return null;
  if (user.onboardingStep === "FACE_ENROLLMENT") return "onboarding";
  if (user.onboardingStep !== "COMPLETE") return null;
  const active = await db.faceEmbedding.count({ where: { userId: user.id, status: "ACTIVE" } });
  if (active === 0) return "self";
  return user.studentProfile.faceReenrollAllowed ? "reenroll" : null;
}

/** Record consent. During onboarding this moves the student on to face enrollment. */
export async function giveConsent(user: CurrentUser) {
  if (user.role !== "STUDENT") throw forbidden();
  const ctx = await requestContext();
  // Record the exact text variant the student was shown (retention wording follows the setting).
  const version = consentVersion(await getSetting("face.deleteRawPhotosAfterEnrollment"));
  await db.$transaction([
    db.biometricConsent.create({
      data: {
        userId: user.id,
        consentVersion: version,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    }),
    db.studentProfile.update({ where: { userId: user.id }, data: { biometricOptOutAt: null } }),
    ...(user.onboardingStep === "BIOMETRIC_CONSENT" || user.onboardingStep === "CHANGE_PASSWORD"
      ? [db.user.update({ where: { id: user.id }, data: { onboardingStep: "FACE_ENROLLMENT" } })]
      : []),
  ]);
  await audit({
    actorId: user.id,
    action: "biometric.consent_given",
    entityType: "User",
    entityId: user.id,
    metadata: { version },
    context: ctx,
  });
}

/**
 * The student declines (or withdraws) biometric consent: any consent is revoked, unfinished
 * samples and photos are deleted, onboarding completes, and attendance is marked manually.
 * Already-ACTIVE face data is only removed through deleteBiometricData (admin, on request).
 */
export async function declineConsent(user: CurrentUser) {
  if (user.role !== "STUDENT" || !user.studentProfile) throw forbidden();
  const ctx = await requestContext();
  const pending = await db.faceEmbedding.findMany({
    where: { userId: user.id, status: "PENDING" },
    select: { photoKey: true },
  });
  await db.$transaction([
    db.faceEmbedding.deleteMany({ where: { userId: user.id, status: "PENDING" } }),
    db.biometricConsent.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    db.studentProfile.update({
      where: { userId: user.id },
      data: { biometricOptOutAt: new Date() },
    }),
    db.user.updateMany({
      where: { id: user.id, onboardingStep: { in: ["BIOMETRIC_CONSENT", "FACE_ENROLLMENT"] } },
      data: { onboardingStep: "COMPLETE" },
    }),
  ]);
  await deletePrivateObjects(pending.flatMap((p) => (p.photoKey ? [p.photoKey] : [])));
  await audit({
    actorId: user.id,
    action: "biometric.consent_declined",
    entityType: "User",
    entityId: user.id,
    context: ctx,
  });
}

/**
 * Validate one enrollment photo, embed it, and store it as the PENDING sample for `angle`.
 * Rejects photos of a different person than the other angles, and faces already enrolled
 * to another account.
 */
export async function addEnrollmentPhoto(user: CurrentUser, angle: FaceAngle, photo: File) {
  if (!(await enrollmentMode(user)))
    throw forbidden("Face enrollment isn't open for your account.");

  const limit = await rateLimit(`face-enroll:${user.id}`, 40, 10 * 60);
  if (!limit.allowed)
    throw new HttpError(429, "rate_limited", "Too many photos. Please wait a few minutes.");
  if (!PHOTO_TYPES.has(photo.type))
    throw new HttpError(415, "unsupported_type", "Use a JPEG, PNG or WebP photo.");
  if (photo.size > MAX_PHOTO_BYTES)
    throw new HttpError(413, "too_large", "The photo is larger than 8 MB.");

  const provider = getFaceProvider();
  let face;
  try {
    face = await provider.embedSingle(photo);
  } catch (err) {
    if (err instanceof FaceQualityError) throw new HttpError(422, err.code, err.message);
    throw err;
  }

  const others = await similarityToPending(user.id, face.embedding, angle);
  if (others.some((o) => o.similarity < SAME_PERSON_MIN)) {
    throw new HttpError(
      422,
      "different_person",
      "This doesn't look like the same person as your other photos. Retake it — only you should be in the photos.",
    );
  }

  const closest = await closestOtherUser(user.id, face.embedding);
  if (closest && closest.similarity >= OTHER_PERSON_MAX) {
    await audit({
      actorId: user.id,
      action: "biometric.duplicate_face_blocked",
      entityType: "User",
      entityId: user.id,
      // The other account is recorded for the administrator to investigate; never shown to the student.
      metadata: {
        matchedUserId: closest.userId,
        similarity: Math.round(closest.similarity * 1000) / 1000,
      },
    });
    throw new HttpError(
      409,
      "already_enrolled_elsewhere",
      "This face is already enrolled to another account. Please contact the college office.",
    );
  }

  const photoKey = `faces/${user.id}/${angle.toLowerCase()}-${randomUUID()}`;
  await putPrivateObject(photoKey, new Uint8Array(await photo.arrayBuffer()), photo.type);
  const replacedKey = await savePendingEmbedding({
    userId: user.id,
    angle,
    embedding: face.embedding,
    modelName: provider.modelName,
    detectionScore: face.score,
    sharpness: face.quality.sharpness,
    photoKey,
  });
  if (replacedKey) await deletePrivateObjects([replacedKey]);

  return { angle, completed: await pendingAngles(user.id) };
}

/** Promote the 5 pending samples to ACTIVE and finish onboarding / re-enrollment. */
export async function completeEnrollment(user: CurrentUser) {
  const mode = await enrollmentMode(user);
  if (!mode) throw forbidden("Face enrollment isn't open for your account.");
  const done = new Set(await pendingAngles(user.id));
  const missing = ENROLLMENT_ANGLES.filter((a) => !done.has(a));
  if (missing.length) {
    throw new HttpError(
      400,
      "incomplete",
      `Still needed: ${missing.map((a) => a.toLowerCase()).join(", ")}.`,
    );
  }

  const replaced = await promotePending(user.id);
  await db.$transaction([
    db.studentProfile.update({
      where: { userId: user.id },
      data: { faceEnrolledAt: new Date(), faceReenrollAllowed: false },
    }),
    ...(mode === "onboarding"
      ? [db.user.update({ where: { id: user.id }, data: { onboardingStep: "COMPLETE" } })]
      : []),
  ]);

  const toDelete = [...replaced];
  if (await getSetting("face.deleteRawPhotosAfterEnrollment"))
    toDelete.push(...(await detachActivePhotos(user.id)));
  await deletePrivateObjects(toDelete);

  await audit({
    actorId: user.id,
    action: "biometric.enrolled",
    entityType: "User",
    entityId: user.id,
    metadata: { mode },
  });
}

/**
 * Delete a student's biometric data on request: embeddings, photos and consent.
 * Afterwards the student is no longer asked to enroll (attendance is marked manually)
 * until an administrator allows re-enrollment, which asks for consent again.
 */
export async function deleteBiometricData(studentUserId: string, actorId: string) {
  const profile = await db.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: { id: true },
  });
  if (!profile) throw notFound("Student not found");

  const photoKeys = await deleteAllEmbeddings(studentUserId);
  await db.$transaction([
    db.biometricConsent.updateMany({
      where: { userId: studentUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    db.studentProfile.update({
      where: { id: profile.id },
      data: { faceEnrolledAt: null, faceReenrollAllowed: false },
    }),
    db.user.updateMany({
      where: {
        id: studentUserId,
        onboardingStep: { in: ["BIOMETRIC_CONSENT", "FACE_ENROLLMENT"] },
      },
      data: { onboardingStep: "COMPLETE" },
    }),
  ]);
  await deletePrivateObjects(photoKeys);
  await audit({
    actorId,
    action: "biometric.data_deleted",
    entityType: "User",
    entityId: studentUserId,
    metadata: { photosDeleted: photoKeys.length },
  });
}

/** Non-sensitive enrollment status for UI (no embeddings or photos). */
export async function enrollmentStatus(userId: string) {
  const [counts, consent] = await Promise.all([
    db.faceEmbedding.groupBy({ by: ["status"], where: { userId }, _count: true }),
    db.biometricConsent.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { givenAt: "desc" },
      select: { givenAt: true, consentVersion: true },
    }),
  ]);
  const count = (s: "ACTIVE" | "PENDING") => counts.find((c) => c.status === s)?._count ?? 0;
  const profile = await db.studentProfile.findUnique({
    where: { userId },
    select: { biometricOptOutAt: true },
  });
  return {
    active: count("ACTIVE"),
    pending: count("PENDING"),
    consent,
    optedOutAt: profile?.biometricOptOutAt ?? null,
  };
}

import "server-only";
import type { FaceAngle } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * All SQL touching face vectors lives here (Prisma can't type pgvector columns).
 * Nothing in this module returns raw embeddings to callers — only ids and similarities.
 */

/** pgvector literal, e.g. "[0.1,-0.2,…]". Values are validated finite numbers, then passed as a bound parameter. */
function vectorLiteral(embedding: number[]): string {
  if (!embedding.every(Number.isFinite)) throw new Error("Embedding contains non-finite values");
  return `[${embedding.join(",")}]`;
}

/** Replace the user's PENDING embedding for an angle. Returns the replaced photo key, if any. */
export async function savePendingEmbedding(input: {
  userId: string;
  angle: FaceAngle;
  embedding: number[];
  modelName: string;
  detectionScore: number;
  sharpness: number;
  photoKey: string | null;
}): Promise<string | null> {
  const vector = vectorLiteral(input.embedding);
  return db.$transaction(async (tx) => {
    const previous = await tx.faceEmbedding.findUnique({
      where: {
        userId_angle_status: { userId: input.userId, angle: input.angle, status: "PENDING" },
      },
      select: { id: true, photoKey: true },
    });
    if (previous) await tx.faceEmbedding.delete({ where: { id: previous.id } });
    await tx.$executeRaw`
      INSERT INTO "FaceEmbedding" ("id", "userId", "angle", "status", "embedding", "modelName",
                                   "detectionScore", "sharpness", "photoKey", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${input.userId}, ${input.angle}::"FaceAngle", 'PENDING',
              ${vector}::vector, ${input.modelName}, ${input.detectionScore}, ${input.sharpness},
              ${input.photoKey}, now(), now())`;
    return previous?.photoKey ?? null;
  });
}

/** Cosine similarity of `embedding` to each of the user's PENDING embeddings (other angles). */
export async function similarityToPending(
  userId: string,
  embedding: number[],
  excludeAngle: FaceAngle,
) {
  return db.$queryRaw<{ angle: FaceAngle; similarity: number }[]>`
    SELECT "angle", 1 - ("embedding" <=> ${vectorLiteral(embedding)}::vector) AS "similarity"
    FROM "FaceEmbedding"
    WHERE "userId" = ${userId} AND "status" = 'PENDING' AND "angle" <> ${excludeAngle}::"FaceAngle"`;
}

/** The most similar ACTIVE embedding belonging to a *different* user, if any. */
export async function closestOtherUser(userId: string, embedding: number[]) {
  const [row] = await db.$queryRaw<{ userId: string; similarity: number }[]>`
    SELECT "userId", 1 - ("embedding" <=> ${vectorLiteral(embedding)}::vector) AS "similarity"
    FROM "FaceEmbedding"
    WHERE "status" = 'ACTIVE' AND "userId" <> ${userId}
    ORDER BY "embedding" <=> ${vectorLiteral(embedding)}::vector
    LIMIT 1`;
  return row ?? null;
}

export async function pendingAngles(userId: string): Promise<FaceAngle[]> {
  const rows = await db.faceEmbedding.findMany({
    where: { userId, status: "PENDING" },
    select: { angle: true },
  });
  return rows.map((r) => r.angle);
}

/**
 * Atomically replace the user's ACTIVE set with the PENDING one.
 * Returns photo keys that are no longer referenced (old ACTIVE photos).
 */
export async function promotePending(userId: string): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const old = await tx.faceEmbedding.findMany({
      where: { userId, status: "ACTIVE" },
      select: { photoKey: true },
    });
    await tx.faceEmbedding.deleteMany({ where: { userId, status: "ACTIVE" } });
    await tx.faceEmbedding.updateMany({
      where: { userId, status: "PENDING" },
      data: { status: "ACTIVE" },
    });
    return old.flatMap((r) => (r.photoKey ? [r.photoKey] : []));
  });
}

/** Detach raw photos from the user's ACTIVE embeddings; returns their keys for deletion. */
export async function detachActivePhotos(userId: string): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const rows = await tx.faceEmbedding.findMany({
      where: { userId, status: "ACTIVE", photoKey: { not: null } },
      select: { photoKey: true },
    });
    await tx.faceEmbedding.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { photoKey: null },
    });
    return rows.map((r) => r.photoKey!);
  });
}

/** Delete every embedding of a user; returns their photo keys for deletion. */
export async function deleteAllEmbeddings(userId: string): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const rows = await tx.faceEmbedding.findMany({ where: { userId }, select: { photoKey: true } });
    await tx.faceEmbedding.deleteMany({ where: { userId } });
    return rows.flatMap((r) => (r.photoKey ? [r.photoKey] : []));
  });
}

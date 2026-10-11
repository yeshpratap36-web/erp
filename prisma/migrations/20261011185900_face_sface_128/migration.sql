-- CreateEnum
CREATE TYPE "FaceEmbeddingStatus" AS ENUM ('PENDING', 'ACTIVE');

-- DropIndex
DROP INDEX "FaceEmbedding_userId_angle_key";

-- DropIndex
DROP INDEX "FaceEmbedding_userId_idx";

-- AlterTable
ALTER TABLE "FaceEmbedding" DROP COLUMN "qualityScore",
ADD COLUMN     "detectionScore" DOUBLE PRECISION,
ADD COLUMN     "sharpness" DOUBLE PRECISION,
ADD COLUMN     "status" "FaceEmbeddingStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "FaceEmbedding_userId_status_idx" ON "FaceEmbedding"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FaceEmbedding_userId_angle_status_key" ON "FaceEmbedding"("userId", "angle", "status");


-- Switch from 512-d ArcFace to 128-d SFace embeddings (hand-written: Prisma doesn't diff
-- Unsupported types). Existing embeddings can't be converted — there are none yet.
ALTER TABLE "FaceEmbedding" ALTER COLUMN "embedding" TYPE vector(128);

-- SFace-calibrated defaults (OpenCV recommends cosine >= 0.363 for "same person"), and delete
-- raw photos after enrollment by default. Only rows still at the old defaults are changed.
UPDATE "Setting" SET "value" = '0.42'::jsonb, "updatedAt" = now() WHERE "key" = 'face.matchThreshold' AND "value" = '0.45'::jsonb;
UPDATE "Setting" SET "value" = '0.33'::jsonb, "updatedAt" = now() WHERE "key" = 'face.uncertainThreshold' AND "value" = '0.35'::jsonb;
UPDATE "Setting" SET "value" = 'true'::jsonb, "updatedAt" = now() WHERE "key" = 'face.deleteRawPhotosAfterEnrollment' AND "value" = 'false'::jsonb;

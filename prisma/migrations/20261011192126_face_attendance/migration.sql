-- CreateEnum
CREATE TYPE "AttendancePhotoStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "FaceMatchStatus" AS ENUM ('MATCHED', 'UNCERTAIN', 'UNMATCHED');

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "biometricOptOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AttendancePhoto" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "photoKey" TEXT,
    "status" "AttendancePhotoStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "faceCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedFace" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "box" JSONB NOT NULL,
    "detectionScore" DOUBLE PRECISION NOT NULL,
    "studentId" TEXT,
    "similarity" DOUBLE PRECISION,
    "status" "FaceMatchStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetectedFace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendancePhoto_sessionId_status_idx" ON "AttendancePhoto"("sessionId", "status");

-- CreateIndex
CREATE INDEX "DetectedFace_photoId_idx" ON "DetectedFace"("photoId");

-- CreateIndex
CREATE INDEX "DetectedFace_studentId_idx" ON "DetectedFace"("studentId");

-- AddForeignKey
ALTER TABLE "AttendancePhoto" ADD CONSTRAINT "AttendancePhoto_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePhoto" ADD CONSTRAINT "AttendancePhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedFace" ADD CONSTRAINT "DetectedFace_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "AttendancePhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedFace" ADD CONSTRAINT "DetectedFace_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;


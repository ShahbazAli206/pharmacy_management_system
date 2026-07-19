-- CreateEnum
CREATE TYPE "TrainingCategory" AS ENUM ('CONTINUING_EDUCATION', 'CERTIFICATION', 'ORIENTATION', 'SAFETY', 'OTHER');

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "category" "TrainingCategory" NOT NULL DEFAULT 'CONTINUING_EDUCATION',
    "creditHours" DOUBLE PRECISION,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingRecord_userId_idx" ON "TrainingRecord"("userId");

-- CreateIndex
CREATE INDEX "TrainingRecord_pharmacyId_expiresAt_idx" ON "TrainingRecord"("pharmacyId", "expiresAt");

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

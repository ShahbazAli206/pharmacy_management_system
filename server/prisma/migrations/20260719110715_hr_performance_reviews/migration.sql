-- CreateEnum
CREATE TYPE "PerformanceRating" AS ENUM ('NEEDS_IMPROVEMENT', 'MEETS_EXPECTATIONS', 'EXCEEDS_EXPECTATIONS', 'OUTSTANDING');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateTable
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "rating" "PerformanceRating" NOT NULL,
    "strengths" TEXT,
    "areasForImprovement" TEXT,
    "goals" TEXT,
    "comments" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PerformanceReview_userId_idx" ON "PerformanceReview"("userId");

-- CreateIndex
CREATE INDEX "PerformanceReview_pharmacyId_status_idx" ON "PerformanceReview"("pharmacyId", "status");

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

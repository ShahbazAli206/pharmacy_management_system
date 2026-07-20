-- AlterTable
ALTER TABLE "Pharmacy" ADD COLUMN     "allowedIpRanges" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastActivityAt" TIMESTAMP(3),
ADD COLUMN     "sinEnc" TEXT;

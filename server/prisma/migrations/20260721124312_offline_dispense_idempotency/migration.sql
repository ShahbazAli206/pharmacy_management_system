-- AlterTable
ALTER TABLE "DispensingRecord" ADD COLUMN "offlineSyncKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DispensingRecord_offlineSyncKey_key" ON "DispensingRecord"("offlineSyncKey");

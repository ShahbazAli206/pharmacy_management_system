-- AlterTable
ALTER TABLE "ComplianceRecord" ADD COLUMN     "dueAt" TIMESTAMP(3);

-- Backfill dueAt for existing rows using the same slot->time convention the
-- application now applies at generation time (single-occurrence tasks due
-- end-of-day 18:00; two-a-day tasks: morning slot 10:00, closing slot 20:00).
UPDATE "ComplianceRecord" cr
SET "dueAt" = cr."dueDate" + (
  CASE
    WHEN t."timesPerDay" <= 1 THEN INTERVAL '18 hours'
    WHEN cr."slot" = 0 THEN INTERVAL '10 hours'
    ELSE INTERVAL '20 hours'
  END
)
FROM "ComplianceTaskTemplate" t
WHERE t.id = cr."templateId";

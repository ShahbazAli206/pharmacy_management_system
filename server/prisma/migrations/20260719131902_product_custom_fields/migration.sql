-- AlterEnum
ALTER TYPE "CustomFieldEntityType" ADD VALUE 'PRODUCT';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "customFields" JSONB NOT NULL DEFAULT '{}';

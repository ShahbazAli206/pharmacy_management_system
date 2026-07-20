-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "paymentTransactionId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "paymentTransactionId" TEXT;

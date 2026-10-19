-- AlterEnum
ALTER TYPE "TokenPurpose" ADD VALUE 'ACCESS';

-- AlterTable
ALTER TABLE "CustomerProfile" ADD COLUMN     "addressRef" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "documentId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "contactAddressRef" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactCity" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactDocumentId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reviewStartedAt" TIMESTAMP(3),
ADD COLUMN     "reviewStartedById" UUID;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_documentId_key" ON "CustomerProfile"("documentId");


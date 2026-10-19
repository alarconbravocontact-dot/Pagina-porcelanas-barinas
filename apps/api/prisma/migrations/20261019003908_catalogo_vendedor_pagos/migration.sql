-- CreateEnum
CREATE TYPE "SlipRating" AS ENUM ('R11', 'R10', 'MODERATE', 'MEDIUM_LOW', 'SLIPPERY');

-- CreateEnum
CREATE TYPE "PriceList" AS ENUM ('DIVISA', 'BCV');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('ACTIVATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "priceList" "PriceList" NOT NULL DEFAULT 'DIVISA';

-- AlterTable
ALTER TABLE "PaymentMethod" ADD COLUMN     "buyerNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "proofInstructions" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receivingDetails" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "PriceHistory" ADD COLUMN     "priceBcvBoxCents" INTEGER,
ADD COLUMN     "priceBcvM2Cents" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "finishNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "priceBcvBoxCents" INTEGER,
ADD COLUMN     "priceBcvM2Cents" INTEGER,
ADD COLUMN     "slipRating" "SlipRating",
ADD COLUMN     "sourceNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "usageGuide" JSONB;

-- AlterTable
ALTER TABLE "Seller" ADD COLUMN     "branch" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "city" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "publicEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "publicPhone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "whatsapp" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "UserToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserToken_tokenHash_key" ON "UserToken"("tokenHash");

-- CreateIndex
CREATE INDEX "UserToken_userId_purpose_idx" ON "UserToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "Product_slipRating_idx" ON "Product"("slipRating");

-- AddForeignKey
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Precios BCV no negativos
ALTER TABLE "Product"
  ADD CONSTRAINT "product_bcv_prices_nonneg" CHECK (("priceBcvBoxCents" IS NULL OR "priceBcvBoxCents" >= 0) AND ("priceBcvM2Cents" IS NULL OR "priceBcvM2Cents" >= 0));

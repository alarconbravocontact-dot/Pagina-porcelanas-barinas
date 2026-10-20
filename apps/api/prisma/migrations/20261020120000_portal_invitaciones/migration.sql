-- CreateTable
CREATE TABLE "PortalInvite" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sellerId" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "customerId" UUID,
    "revokedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalInvite_tokenHash_key" ON "PortalInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalInvite_sellerId_createdAt_idx" ON "PortalInvite"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalInvite_customerId_idx" ON "PortalInvite"("customerId");

-- AddForeignKey
ALTER TABLE "PortalInvite" ADD CONSTRAINT "PortalInvite_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalInvite" ADD CONSTRAINT "PortalInvite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;


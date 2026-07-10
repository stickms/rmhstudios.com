-- CreateTable
CREATE TABLE "storefront_product" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "price" INTEGER NOT NULL,
    "deliverable" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "storefront_product_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "storefront_product_creatorId_idx" ON "storefront_product"("creatorId");
ALTER TABLE "storefront_product" ADD CONSTRAINT "storefront_product_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "storefront_purchase" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "storefront_purchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "storefront_purchase_productId_buyerId_key" ON "storefront_purchase"("productId", "buyerId");
CREATE INDEX "storefront_purchase_buyerId_idx" ON "storefront_purchase"("buyerId");
ALTER TABLE "storefront_purchase" ADD CONSTRAINT "storefront_purchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "storefront_product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "storefront_purchase" ADD CONSTRAINT "storefront_purchase_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

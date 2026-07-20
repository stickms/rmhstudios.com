-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "wishlistPublic" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "wishlist_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" VARCHAR(24) NOT NULL,
    "entityId" TEXT NOT NULL,
    "targetPrice" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wishlist_entry_entityType_entityId_idx" ON "wishlist_entry"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_entry_userId_entityType_entityId_key" ON "wishlist_entry"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "wishlist_entry" ADD CONSTRAINT "wishlist_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


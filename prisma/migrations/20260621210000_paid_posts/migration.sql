-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN "unlockPrice" INTEGER;

-- CreateTable
CREATE TABLE "post_unlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_unlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "post_unlock_userId_rmheetId_key" ON "post_unlock"("userId", "rmheetId");
CREATE INDEX "post_unlock_rmheetId_idx" ON "post_unlock"("rmheetId");
ALTER TABLE "post_unlock" ADD CONSTRAINT "post_unlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_unlock" ADD CONSTRAINT "post_unlock_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

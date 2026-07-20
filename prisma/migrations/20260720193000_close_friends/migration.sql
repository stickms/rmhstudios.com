-- AlterEnum
ALTER TYPE "RMHarkAudience" ADD VALUE 'CIRCLE';

-- CreateTable
CREATE TABLE "close_friend" (
    "ownerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "close_friend_pkey" PRIMARY KEY ("ownerId","memberId")
);

-- CreateIndex
CREATE INDEX "close_friend_memberId_idx" ON "close_friend"("memberId");

-- AddForeignKey
ALTER TABLE "close_friend" ADD CONSTRAINT "close_friend_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "close_friend" ADD CONSTRAINT "close_friend_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


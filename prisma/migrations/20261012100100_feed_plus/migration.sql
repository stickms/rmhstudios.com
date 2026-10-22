-- P01 feed-plus (X2 hidden replies, X6 take meter, X12 require-alt-text).
-- Additive only: defaulted columns on user/rmheet/rmheet_comment and one new table.
-- No index is added to "rmheet": quote lookups (X10) use the existing "rmheet_originalId_idx",
-- and a plain CREATE INDEX there would block writes to the site's hottest table.

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "requireAltText" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN     "isTake" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "takeAgreeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "takeDisagreeCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "rmheet_comment" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "rmheet_take_vote" (
    "id" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agree" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmheet_take_vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmheet_take_vote_userId_idx" ON "rmheet_take_vote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "rmheet_take_vote_rmheetId_userId_key" ON "rmheet_take_vote"("rmheetId", "userId");

-- AddForeignKey
ALTER TABLE "rmheet_take_vote" ADD CONSTRAINT "rmheet_take_vote_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rmheet_take_vote" ADD CONSTRAINT "rmheet_take_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- U15 profile guestbook. Additive only (a new table and a defaulted column),
-- so it is safe under blue/green: the old image never names either.
-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "guestbookMode" VARCHAR(12) NOT NULL DEFAULT 'off';

-- CreateTable
CREATE TABLE "guestbook_entry" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(280) NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guestbook_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guestbook_entry_ownerId_createdAt_idx" ON "guestbook_entry"("ownerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "guestbook_entry_authorId_ownerId_createdAt_idx" ON "guestbook_entry"("authorId", "ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "guestbook_entry" ADD CONSTRAINT "guestbook_entry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestbook_entry" ADD CONSTRAINT "guestbook_entry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


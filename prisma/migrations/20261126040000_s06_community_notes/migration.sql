-- s06-02: private moderator notes on community members (one table, additive).
-- Ids are plain columns; account deletion removes notes about a member in code.
-- CreateTable
CREATE TABLE "community_member_note" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" VARCHAR(500) NOT NULL,
    "banId" TEXT,
    "modItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "community_member_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_member_note_communityId_subjectId_createdAt_idx" ON "community_member_note"("communityId", "subjectId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "community_member_note" ADD CONSTRAINT "community_member_note_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;


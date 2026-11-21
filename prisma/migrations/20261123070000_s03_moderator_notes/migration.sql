-- Moderator notes: internal, admin-only notes on a member account (edit history, pins, soft delete).
-- Additive only: one new table, one index, two foreign keys to "user".

-- CreateTable
CREATE TABLE "moderator_note" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" VARCHAR(2000) NOT NULL,
    "editedFrom" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reportId" TEXT,
    "strikeId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderator_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderator_note_subjectId_pinned_createdAt_idx" ON "moderator_note"("subjectId", "pinned", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "moderator_note" ADD CONSTRAINT "moderator_note_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderator_note" ADD CONSTRAINT "moderator_note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Written feedback on game jam entries (s06-07): one optional note saved with a rating, private to the entry team,
-- plus the per-entry marker that batches the "new feedback" notification to once an hour.
-- AlterTable
ALTER TABLE "game_jam_entry" ADD COLUMN     "feedbackNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "game_jam_feedback" (
    "id" TEXT NOT NULL,
    "ratingId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "helpfulAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_jam_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_jam_feedback_ratingId_key" ON "game_jam_feedback"("ratingId");

-- CreateIndex
CREATE INDEX "game_jam_feedback_entryId_createdAt_idx" ON "game_jam_feedback"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "game_jam_feedback_authorId_idx" ON "game_jam_feedback"("authorId");

-- AddForeignKey
ALTER TABLE "game_jam_feedback" ADD CONSTRAINT "game_jam_feedback_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "game_jam_rating"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_feedback" ADD CONSTRAINT "game_jam_feedback_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "game_jam_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_feedback" ADD CONSTRAINT "game_jam_feedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Append-only flashcard review history (one row per review, same transaction as the SM-2 update).
-- Feeds /study/stats: daily activity, streaks and retention. Additive: one new table.

-- CreateTable
CREATE TABLE "flashcard_review_log" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "easeFactor" DOUBLE PRECISION NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flashcard_review_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flashcard_review_log_userId_reviewedAt_idx" ON "flashcard_review_log"("userId", "reviewedAt");

-- CreateIndex
CREATE INDEX "flashcard_review_log_userId_deckId_reviewedAt_idx" ON "flashcard_review_log"("userId", "deckId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "flashcard_review_log" ADD CONSTRAINT "flashcard_review_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_review_log" ADD CONSTRAINT "flashcard_review_log_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;


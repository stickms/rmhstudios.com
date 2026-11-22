-- Practice-test results: one append-only row per finished flashcard test, kept apart from the
-- SM-2 state so tests never change a schedule (lib/study/tests.server.ts).
-- CreateTable
CREATE TABLE "flashcard_test_result" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "kinds" TEXT[],
    "durationMs" INTEGER NOT NULL,
    "missedCardIds" TEXT[],
    "seed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flashcard_test_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flashcard_test_result_userId_deckId_createdAt_idx" ON "flashcard_test_result"("userId", "deckId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "flashcard_test_result" ADD CONSTRAINT "flashcard_test_result_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_test_result" ADD CONSTRAINT "flashcard_test_result_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "flashcard_deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;


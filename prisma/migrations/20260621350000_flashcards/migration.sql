-- CreateTable
CREATE TABLE "flashcard_deck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "cardCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "flashcard_deck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "flashcard_deck_userId_idx" ON "flashcard_deck"("userId");
CREATE INDEX "flashcard_deck_isPublic_updatedAt_idx" ON "flashcard_deck"("isPublic", "updatedAt" DESC);
ALTER TABLE "flashcard_deck" ADD CONSTRAINT "flashcard_deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "flashcard" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "flashcard_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "flashcard_deckId_idx" ON "flashcard"("deckId");
ALTER TABLE "flashcard" ADD CONSTRAINT "flashcard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "flashcard_deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "flashcard_review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "flashcard_review_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "flashcard_review_userId_cardId_key" ON "flashcard_review"("userId", "cardId");
CREATE INDEX "flashcard_review_userId_dueAt_idx" ON "flashcard_review"("userId", "dueAt");
ALTER TABLE "flashcard_review" ADD CONSTRAINT "flashcard_review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "flashcard_review" ADD CONSTRAINT "flashcard_review_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

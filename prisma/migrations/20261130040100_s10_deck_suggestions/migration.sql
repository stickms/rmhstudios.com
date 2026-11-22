-- Suggested corrections to a public deck's cards (s10-04). Additive: one defaulted column and one new table.
-- "acceptsSuggestions" is false for every deck, so nothing changes until an author turns it on.
ALTER TABLE "flashcard_deck" ADD COLUMN "acceptsSuggestions" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "deck_suggestion" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "suggesterId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "note" VARCHAR(500),
    "baseHash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "declineReason" VARCHAR(200),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_suggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deck_suggestion_deckId_status_createdAt_idx" ON "deck_suggestion"("deckId", "status", "createdAt");
CREATE INDEX "deck_suggestion_suggesterId_createdAt_idx" ON "deck_suggestion"("suggesterId", "createdAt");
CREATE INDEX "deck_suggestion_cardId_idx" ON "deck_suggestion"("cardId");

ALTER TABLE "deck_suggestion" ADD CONSTRAINT "deck_suggestion_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "flashcard_deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deck_suggestion" ADD CONSTRAINT "deck_suggestion_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deck_suggestion" ADD CONSTRAINT "deck_suggestion_suggesterId_fkey" FOREIGN KEY ("suggesterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

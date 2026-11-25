-- s11-10 — editors on a flashcard deck. Additive: one new table, no change to an existing one.
CREATE TABLE "deck_editor" (
    "deckId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "deck_editor_pkey" PRIMARY KEY ("deckId","userId")
);

CREATE INDEX "deck_editor_userId_status_idx" ON "deck_editor"("userId", "status");

CREATE INDEX "deck_editor_invitedById_status_idx" ON "deck_editor"("invitedById", "status");

ALTER TABLE "deck_editor" ADD CONSTRAINT "deck_editor_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "flashcard_deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deck_editor" ADD CONSTRAINT "deck_editor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deck_editor" ADD CONSTRAINT "deck_editor_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

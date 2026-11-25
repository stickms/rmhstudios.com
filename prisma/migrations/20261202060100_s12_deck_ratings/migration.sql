-- s12 08: stars on a public deck and a count of its copies. Additive only: constant defaults, one new table.
ALTER TABLE "flashcard_deck" ADD COLUMN "ratingSum" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "flashcard_deck" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "flashcard_deck" ADD COLUMN "copyCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "deck_rating" (
    "deckId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deck_rating_pkey" PRIMARY KEY ("deckId","userId")
);

CREATE INDEX "deck_rating_userId_idx" ON "deck_rating"("userId");

ALTER TABLE "deck_rating" ADD CONSTRAINT "deck_rating_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "flashcard_deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deck_rating" ADD CONSTRAINT "deck_rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The copies that already exist are counted once: every deck that names a source adds one to it.
UPDATE "flashcard_deck" AS d
SET "copyCount" = c."n"
FROM (
    SELECT "clonedFromId", count(*)::int AS "n"
    FROM "flashcard_deck"
    WHERE "clonedFromId" IS NOT NULL
    GROUP BY "clonedFromId"
) AS c
WHERE d."id" = c."clonedFromId";

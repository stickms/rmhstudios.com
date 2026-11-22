-- A study pace and a test date for each deck (s10-03). Additive: four columns on "flashcard_deck", all nullable or defaulted.
-- "newPerDay" NULL keeps today's per-session behaviour, so no existing deck changes.
ALTER TABLE "flashcard_deck" ADD COLUMN "newPerDay" INTEGER,
ADD COLUMN "testDate" VARCHAR(10),
ADD COLUMN "extraNewDay" VARCHAR(10),
ADD COLUMN "extraNew" INTEGER NOT NULL DEFAULT 0;

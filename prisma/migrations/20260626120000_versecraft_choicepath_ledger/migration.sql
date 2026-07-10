-- Add choice-path-aware caching + ledger storage to generated chapters.
ALTER TABLE "versecraft_gen_chapter"
  ADD COLUMN "choicePathHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "ledger" JSONB;

-- Replace the (seed, index) unique with (seed, index, choicePathHash).
DROP INDEX IF EXISTS "versecraft_gen_chapter_seed_index_key";
CREATE UNIQUE INDEX "versecraft_gen_chapter_seed_index_choicePathHash_key"
  ON "versecraft_gen_chapter" ("seed", "index", "choicePathHash");

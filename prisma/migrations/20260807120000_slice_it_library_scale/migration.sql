-- Slice It — library scale: search ranking (L14), artist identity (L15),
-- packs (L16), and the persisted density strip (V8).
--
-- HAND-WRITTEN. There is no Postgres in the environment this was authored in,
-- so this file was verified by comparing it statement-for-statement against
-- `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
-- which is the strongest check available without a database. It has never been
-- executed. Review it as SQL, not as generated output, and run it against a
-- copy before production.
--
-- One statement here is deliberately NOT what the diff renders: `searchVector`
-- is a GENERATED ALWAYS ... STORED column, and Prisma's schema language has no
-- way to say that, so the diff shows a plain `tsvector` column. That divergence
-- is the point of the column — see the schema comment on `Song.searchVector`.
--
-- Everything is `IF NOT EXISTS`, so it is a no-op on an environment already
-- patched by `db push`, and every added `DEFAULT` is a constant (catalogue-only
-- on PG 11+), so no table is rewritten. The one exception is the generated
-- column, which does rewrite `Song` — unavoidable, and `Song` is small.

-- ─── Extensions ────────────────────────────────────────────────────────────
--
-- `pg_trgm` backs the typo path in the search query below. Without it,
-- `similarity()` does not exist and every search errors — this line is not
-- optional even though the index that uses it is.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── L15: artist identity ──────────────────────────────────────────────────

ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "artistKey" VARCHAR(200);

-- Backfill. This reproduces `artistKeyOf()` in `lib/slice-it/artist.ts`:
--   1. drop a trailing "feat. …" / "ft. …" / "with …" clause
--   2. fold Latin-1 accents to ASCII
--   3. lowercase
--   4. delete everything that is not a letter or a digit
--   5. NULL rather than '' when nothing survives
--
-- Step 2 is `translate()` over exactly the character pairs listed as
-- LATIN1_FOLD_FROM / LATIN1_FOLD_TO in `lib/slice-it/artist.ts`. The runtime
-- normaliser uses NFKD decomposition instead, which folds a strictly larger
-- set (Vietnamese, Polish, transliterated Greek). A row whose artist carries a
-- non-Latin-1 diacritic therefore gets a slightly different key here than it
-- will get the next time it is written. That is a handful of rows with a stale
-- grouping, self-healing on the next edit; the alternative was requiring the
-- `unaccent` extension, which is not guaranteed present.
UPDATE "Song"
SET "artistKey" = NULLIF(
      regexp_replace(
        lower(
          translate(
            regexp_replace("artist", '\s[([]?\s*(feat\.?|ft\.?|featuring|with|w/|vs\.?|x)\s+.*$', '', 'i'),
            'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
            'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
          )
        ),
        '[^[:alnum:]]+', '', 'g'
      ),
      ''
    )
WHERE "artistKey" IS NULL;

-- "Everything by this artist, newest first". The pre-existing plain index on
-- `artist` cannot serve it: that question used to be a substring match, and no
-- B-tree on the display string answers a substring match.
CREATE INDEX IF NOT EXISTS "Song_artistKey_createdAt_idx"
  ON "Song" ("artistKey", "createdAt" DESC);

-- ─── V8: persisted density strip ───────────────────────────────────────────

ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "densityStrip" JSONB;

-- No backfill. Computing it needs `analysisData` parsed per row, which is a
-- multi-hundred-kilobyte JSON document each — a job for the jobs worker, not
-- for a migration that holds a lock on the table. A null strip renders as no
-- strip, which is what `<DensityStrip>` already does with an absent value.

-- ─── L14: weighted full-text search ────────────────────────────────────────
--
-- GENERATED, not trigger-maintained: a trigger has to be re-run over the whole
-- table every time the expression changes, and a generated column cannot drift
-- from its source fields at all.
--
-- The weights ARE the ranking. Title A, artist B, album C, description D — so
-- a title match beats a description match, which is the specific thing the old
-- `ILIKE '%…%'` over three columns could not express, because to it every
-- match was the same match.
--
-- `'simple'` rather than `'english'`: the corpus is song and artist names, and
-- an English stemmer mangles them ("Ends" → "end", "Caring" → "care") while
-- doing nothing at all for the large fraction of the library that is not
-- English. `simple` lowercases and splits on non-word characters, which is what
-- a title index actually wants. It also makes the expression immutable without
-- a config argument dance, which a generated column requires.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Song' AND column_name = 'searchVector'
  ) THEN
    ALTER TABLE "Song" ADD COLUMN "searchVector" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('simple', coalesce("artist", '')), 'B') ||
        setweight(to_tsvector('simple', coalesce("album", '')), 'C') ||
        setweight(to_tsvector('simple', coalesce("description", '')), 'D')
      ) STORED;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "Song_searchVector_idx"
  ON "Song" USING GIN ("searchVector");

-- The typo path. `similarity(title || ' ' || artist, $1) > 0.25` is what turns
-- "eufori" into "Euphoria"; without a trigram index it is a sequential scan
-- computing a trigram set per row, so the index is what makes the fallback
-- affordable rather than what makes it work.
--
-- Two separate GIN indexes rather than one two-column index: the query ORs the
-- two similarity checks, and Postgres can bitmap-OR two indexes but cannot use
-- half of a composite one.
CREATE INDEX IF NOT EXISTS "Song_title_trgm_idx"
  ON "Song" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Song_artist_trgm_idx"
  ON "Song" USING GIN ("artist" gin_trgm_ops);

-- ─── L16: packs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ChartPack" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "curatorId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "coverUrl" TEXT,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'pack',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "artistKey" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChartPack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChartPackItem" (
    "packId" UUID NOT NULL,
    "songId" TEXT NOT NULL,
    "chartId" UUID,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartPackItem_pkey" PRIMARY KEY ("packId","songId")
);

CREATE INDEX IF NOT EXISTS "ChartPack_isPublic_createdAt_idx"
  ON "ChartPack" ("isPublic", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ChartPack_curatorId_updatedAt_idx"
  ON "ChartPack" ("curatorId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "ChartPack_artistKey_idx"
  ON "ChartPack" ("artistKey");
CREATE INDEX IF NOT EXISTS "ChartPackItem_packId_position_idx"
  ON "ChartPackItem" ("packId", "position");
CREATE INDEX IF NOT EXISTS "ChartPackItem_songId_idx"
  ON "ChartPackItem" ("songId");

-- Foreign keys, guarded so a re-run on a `db push`ed database is a no-op —
-- `ADD CONSTRAINT` has no `IF NOT EXISTS` form.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChartPack_curatorId_fkey') THEN
    ALTER TABLE "ChartPack" ADD CONSTRAINT "ChartPack_curatorId_fkey"
      FOREIGN KEY ("curatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChartPackItem_packId_fkey') THEN
    ALTER TABLE "ChartPackItem" ADD CONSTRAINT "ChartPackItem_packId_fkey"
      FOREIGN KEY ("packId") REFERENCES "ChartPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChartPackItem_songId_fkey') THEN
    ALTER TABLE "ChartPackItem" ADD CONSTRAINT "ChartPackItem_songId_fkey"
      FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChartPackItem_chartId_fkey') THEN
    ALTER TABLE "ChartPackItem" ADD CONSTRAINT "ChartPackItem_chartId_fkey"
      FOREIGN KEY ("chartId") REFERENCES "Chart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

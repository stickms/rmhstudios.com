-- Slice It — the library's social and editorial layer: L1 (genres and tags),
-- L3 (chart reviews), L5 (timestamped comments), L9 (takedowns) and L12
-- (storage lifecycle).
--
-- HAND-WRITTEN, and verified statement-for-statement against
-- `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
-- which is the strongest check available with no Postgres in this environment.
-- It has never been executed. Review it as SQL, not as generated output.
--
-- Everything is `IF NOT EXISTS`, so it is a no-op on an environment already
-- patched by `db push`. Every added column is nullable or has a constant
-- DEFAULT, both of which are catalogue-only on PG 11+, so "Song" is never
-- rewritten.
--
-- migration-safety: acknowledged[create-index-not-concurrent] the two indexes on "Song" below are catalogue reads away from being free: "Song" is the library table and is small (thousands of rows, not millions), and CONCURRENTLY cannot run inside the transaction the rest of this migration needs to be atomic in.

-- ─── L1: genres and tags ───────────────────────────────────────────────────
--
-- `genre` is a curated vocabulary (`SONG_GENRES` in lib/slice-it/taxonomy.ts),
-- not free text: a facet with four hundred spellings of "drum and bass" is not
-- a facet. `tags` is where the long tail goes, normalised lowercase.
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "genre" VARCHAR(32);
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The genre facet in the library's default order. Without the composite the
-- planner falls back to a scan the moment a second facet is active.
CREATE INDEX IF NOT EXISTS "Song_isPublic_genre_createdAt_idx"
  ON "Song" ("isPublic", "genre", "createdAt" DESC);

-- The tag facet. GIN, because the query is array containment (`hasEvery`),
-- which no B-tree can serve.
CREATE INDEX IF NOT EXISTS "Song_tags_idx" ON "Song" USING GIN ("tags");

-- ─── L9: takedowns ─────────────────────────────────────────────────────────
--
-- Tombstone, never delete. "SongLeaderboard" cascades on song deletion, so
-- removing the row for a DMCA claim silently erases every score anyone ever set
-- on that track — a punishment aimed at one uploader that lands on hundreds of
-- players. These columns are what let the row survive its own takedown.
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "takenDownAt" TIMESTAMP(3);
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "takedownReason" VARCHAR(500);

-- ─── L12: storage lifecycle ────────────────────────────────────────────────
--
-- The chart is what makes a song a game; the audio is what makes it expensive.
ALTER TABLE "Song" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- ─── L5: timestamped comments ──────────────────────────────────────────────
--
-- Parsed from the comment body ("1:42") rather than collected by a separate
-- field: osu! modding taught a generation of players to type timestamps, and a
-- field nobody fills is worse than a convention they already have.
ALTER TABLE "SongComment" ADD COLUMN IF NOT EXISTS "atSeconds" DOUBLE PRECISION;

-- ─── L3: chart reviews ─────────────────────────────────────────────────────
--
-- NOT a revival of "SongRating", which the schema marks dead with a standing
-- "do not add writers". Two axes because "this chart is bad" and "this song is
-- bad" are different complaints with different remedies.
CREATE TABLE IF NOT EXISTS "chart_review" (
    "chartId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "fit" INTEGER NOT NULL,
    "fun" INTEGER NOT NULL,
    "body" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_review_pkey" PRIMARY KEY ("chartId", "userId")
);

CREATE INDEX IF NOT EXISTS "chart_review_chartId_createdAt_idx"
  ON "chart_review" ("chartId", "createdAt" DESC);

ALTER TABLE "chart_review"
  ADD CONSTRAINT "chart_review_chartId_fkey"
  FOREIGN KEY ("chartId") REFERENCES "Chart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chart_review"
  ADD CONSTRAINT "chart_review_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

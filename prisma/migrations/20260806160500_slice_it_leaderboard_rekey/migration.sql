-- Slice It: re-key the leaderboard, and stop deleting every run (R1, R6, R9, H7).
--
-- ## R1 — the defect
--
-- `SongLeaderboard` was `UNIQUE ("songId", "userId")`: **one row per player per
-- song**, across all four difficulties and every modifier combination. Two
-- consequences, both silent and both wrong:
--
--   * Setting a personal best on `normal` OVERWROTE your `expert` record. The
--     upsert in `/api/slice-it/score` matched on the pair and replaced whatever
--     it found, so the better run simply stopped existing.
--   * An `easy` run with six modifiers ranked against an `expert` full combo.
--     `calculateScoreMultiplier` partly compensated and cannot do more than
--     that: it prices a modifier, it cannot make two different charts into one
--     contest.
--
-- The key becomes `("songId", "difficulty", "modPool", "userId")`.
--
-- **On `songId` rather than `chartId`.** The idea sketch keys the board on the
-- chart, and the unique index cannot: `chartId` is NULL on every row written
-- before the `Chart` model existed, and Postgres treats NULLs in a unique index
-- as DISTINCT — a key over a nullable column would enforce nothing at all on
-- exactly the rows that exist today, and the upsert would insert a duplicate on
-- every submission. `chartId` is carried as a pointer (and indexed), the key is
-- the song.
--
-- ## The backfill
--
-- `difficulty` and `modPool` are derived from the `modifiers` JSON that was
-- already being stored — which is the whole reason that column was worth
-- keeping. The `CASE` below is the SQL mirror of `poolOfStoredRow()` in
-- `lib/slice-it/pools.ts`, and `lib/slice-it/__tests__/pools.test.ts` pins the
-- two together case by case. If you change one, change the other.
--
-- Comparisons are made against the TEXT form (`->> 'invisible' = 'true'`)
-- rather than `::bool`. A cast raises on any value that is not a boolean
-- literal, and this column has been written by three different code paths over
-- its life; a backfill that aborts the whole migration because one historical
-- row stored `"speed": "1.0"` as a string is not a better outcome than one that
-- reads it as absent.
--
-- No row can collide on the new key: the old constraint already guaranteed at
-- most one row per `(songId, userId)`, so the unique index builds cleanly.
--
-- ## R6 — `slice_run`
--
-- Every attempt except your best was destroyed on submit, including the Welford
-- timing statistics the engine computes and the integrity verdict the server
-- computes. `slice_run` is the append-only history; `SongLeaderboard` becomes
-- the materialised "best" pointer over it. `BIGSERIAL` rather than a `cuid()`,
-- per the new-table PK policy in `lib/CLAUDE.md` §Database: this is the
-- highest-volume table in the game and every read of it is ordered by insertion.
--
-- ## Blue/green window — READ THIS BEFORE DEPLOYING
--
-- `deploy.sh` runs `prisma migrate deploy` and THEN hot-swaps the web tier, so
-- for the length of the swap the OLD code talks to the NEW schema. Dropping
-- `SongLeaderboard_songId_userId_key` is the statement that matters here: the
-- old `/api/slice-it/score` and the hub's `persistResults` both address a row by
-- that pair, and Prisma's `upsert` compiles to `INSERT ... ON CONFLICT` naming
-- the constraint. During the swap those two write paths fail.
--
-- That is survivable and it is not free. Both are best-effort writes — the hub
-- catches and logs (`slice_results_persist_failed`), the route returns a 500 the
-- client already treats as "score not saved" — so the failure mode is a handful
-- of scores lost during a swap that takes seconds, not an outage. Deploy it when
-- the game is quiet. The alternative (keep the old unique through one deploy,
-- drop it in the next) does not work: the old constraint is what forbids the
-- second row per player that this whole change exists to allow, so the new code
-- cannot run beside it.
--
-- migration-safety: acknowledged[create-index-not-concurrent] `SongLeaderboard`
-- is one row per player per song per board — low thousands, bounded by a song
-- library that is itself capped at 10 GB of audio. The two indexes on it build
-- in milliseconds; every other index here is on `slice_run`, CREATEd empty in
-- this same migration. CREATE INDEX CONCURRENTLY cannot run inside the
-- transaction Prisma wraps a migration in, so taking them concurrently would
-- mean splitting this into a migration plus a manual step for a lock nobody
-- would observe.

-- ─── R1: new columns on the board ──────────────────────────────────────────

ALTER TABLE "SongLeaderboard"
  ADD COLUMN IF NOT EXISTS "chartId"     UUID,
  ADD COLUMN IF NOT EXISTS "chartHash"   CHAR(64),
  ADD COLUMN IF NOT EXISTS "difficulty"  VARCHAR(16) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "modPool"     VARCHAR(16) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "cleared"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isFullCombo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isPerfect"   BOOLEAN NOT NULL DEFAULT false;

-- ─── R1: the backfill (mirror of poolOfStoredRow in lib/slice-it/pools.ts) ──

UPDATE "SongLeaderboard" SET
  "difficulty" = CASE
      WHEN "modifiers"->>'difficulty' IN ('easy', 'normal', 'hard', 'expert')
        THEN "modifiers"->>'difficulty'
      ELSE 'normal'
    END,
  "modPool" = CASE
      -- Challenge: anything that changes what the player SEES or how tight the
      -- windows are. A score set under one of these says nothing about a score
      -- set without them, in either direction.
      WHEN "modifiers"->>'invisible'    = 'true'
        OR "modifiers"->>'spin'         = 'true'
        OR "modifiers"->>'strictTiming' = 'true'
        OR "modifiers"->>'oneTrack'     = 'true'
        OR "modifiers"->>'switching'    = 'true'
        OR "modifiers"->>'bombs'        = 'true'
        THEN 'challenge'
      -- Standard: speed, and the risk gauges, which can only END a run early —
      -- they never reveal a note, move a note or widen a window.
      WHEN "modifiers"->>'suddenDeath'  = 'true'
        OR "modifiers"->>'healthGauge'  = 'true'
        OR COALESCE("speedMod", 1.0) <> 1.0
        OR (   "modifiers"->>'speed' ~ '^[0-9]+(\.[0-9]+)?$'
           AND ("modifiers"->>'speed')::numeric <> 1 )
        THEN 'standard'
      ELSE 'none'
    END;

-- ─── R1: swap the key ───────────────────────────────────────────────────────

DROP INDEX IF EXISTS "SongLeaderboard_songId_userId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "SongLeaderboard_songId_difficulty_modPool_userId_key"
  ON "SongLeaderboard"("songId", "difficulty", "modPool", "userId");

-- The board read: one song, one tier, one pool, ordered by score.
CREATE INDEX IF NOT EXISTS "SongLeaderboard_songId_difficulty_modPool_score_idx"
  ON "SongLeaderboard"("songId", "difficulty", "modPool", "score" DESC);

-- The player page (X12) reads one account's bests, best first.
CREATE INDEX IF NOT EXISTS "SongLeaderboard_userId_score_idx"
  ON "SongLeaderboard"("userId", "score" DESC);

CREATE INDEX IF NOT EXISTS "SongLeaderboard_chartId_score_idx"
  ON "SongLeaderboard"("chartId", "score" DESC);

DO $$
BEGIN
  ALTER TABLE "SongLeaderboard" ADD CONSTRAINT "SongLeaderboard_chartId_fkey"
    FOREIGN KEY ("chartId") REFERENCES "Chart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── R6: the append-only run history ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "slice_run" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "chartId" UUID,
    "chartHash" CHAR(64),
    "score" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "maxCombo" INTEGER NOT NULL,
    "notesResolved" INTEGER,
    "difficulty" VARCHAR(16) NOT NULL,
    "modPool" VARCHAR(16) NOT NULL,
    "modifiers" JSONB NOT NULL,
    "multiplayer" BOOLEAN NOT NULL DEFAULT false,
    "cleared" BOOLEAN NOT NULL DEFAULT true,
    "isFullCombo" BOOLEAN NOT NULL DEFAULT false,
    "isPerfect" BOOLEAN NOT NULL DEFAULT false,
    "timingCount" INTEGER,
    "timingMeanMs" DOUBLE PRECISION,
    "timingSdMs" DOUBLE PRECISION,
    "suspicion" DOUBLE PRECISION,
    "suspicions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slice_run_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "slice_run_userId_chartId_createdAt_idx"
  ON "slice_run"("userId", "chartId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "slice_run_chartId_createdAt_idx"
  ON "slice_run"("chartId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "slice_run_userId_createdAt_idx"
  ON "slice_run"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "slice_run_songId_createdAt_idx"
  ON "slice_run"("songId", "createdAt" DESC);

DO $$
BEGIN
  ALTER TABLE "slice_run" ADD CONSTRAINT "slice_run_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "slice_run" ADD CONSTRAINT "slice_run_songId_fkey"
    FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "slice_run" ADD CONSTRAINT "slice_run_chartId_fkey"
    FOREIGN KEY ("chartId") REFERENCES "Chart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Slice It: the rating and ranking axis (C3, R2, R10).
--
-- ## What this adds, and why each piece is separate from the last
--
-- **C3 — `Chart.rating`.** The column already existed (it shipped with the
-- editor's `Chart` table) and nothing ever wrote it. What is added beside it is
-- the bookkeeping that makes a stored rating usable: `ratingVersion` and
-- `ratedAt`. Without a version, a library holding ratings produced by three
-- different weight sets is a library that cannot be sorted meaningfully and
-- offers no way to find the stale rows. The weights are in
-- `lib/slice-it/rating.ts` and they are explicitly uncalibrated — see that
-- file's header.
--
-- **C3 — `Song.chartRating`.** Denormalised "hardest rated chart of this song",
-- so the library's difficulty sort is an index scan rather than a GROUP BY over
-- `Chart` on every page of every browse. It is NULL for every song today, and
-- NULL must sort last rather than as a zero: no chart of that song has been
-- rated, which is not the same claim as "it is trivially easy".
--
-- **R2 — `Player.skillRating`.** `Player.totalScore` is left exactly as it is.
-- It sums every score ever submitted, so it ranks VOLUME PLAYED: a player who
-- grinds easy charts outranks a better player who does not. It is still a real
-- statistic and it is still what the profile card shows, so it keeps its
-- meaning and the ranking moves to a new column rather than being rewritten
-- underneath a shipped one.
--
-- **R10 — `Chart.rankStatus`.** `unranked` → `qualified` → `ranked`, gated on
-- the linter, a play threshold and a clear rate. Only `ranked` charts feed the
-- skill rating. Without it any uploaded chart feeds the global total and a
-- 15-minute upload can be farmed — the plausibility bound in `scoring.ts`
-- scales WITH duration, so it does not stop this.
--
-- ## Why `rankStatus` and not the existing `Chart.status`
--
-- The idea sketch puts these transitions on `Chart.status`. That column is
-- already the VISIBILITY lifecycle — `draft` (author only) / `public` (in the
-- library) — and four call sites read it as one:
-- `lib/slice-it/player.server.ts`, `app/routes/api/slice-it/charts.ts`,
-- `app/routes/api/slice-it/charts/$id.ts` and
-- `lib/slice-it/editor/seed.server.ts`. Visibility and rankedness are
-- orthogonal: every public chart starts out unranked, and a chart being ranked
-- says nothing about who can see it. Collapsing them into one column would mean
-- either an `unranked` value that hides the chart or a `ranked` value that
-- publishes it, and would break the four reads above — files owned by other
-- work in flight.
--
-- Those reads match `status IN ('public','ranked')`, which stays correct: this
-- migration writes no new `'ranked'` into `status`, and the pre-existing rows
-- (if any) keep working. The value simply stops being minted.
--
-- ## This has NEVER been run against a database
--
-- There is no Postgres in this environment. This file was hand-written to match
-- the schema edits, and checked only with `prisma validate` and
-- `prisma generate`. Review it as SQL, not as generated output. `IF NOT EXISTS`
-- throughout so an environment already patched by `db push` applies it as a
-- no-op.
--
-- migration-safety: acknowledged[create-index-not-concurrent] `Chart` is one
-- row per (song, difficulty, keys, author) and `Player` is one row per account —
-- both low thousands, both far below the size at which a brief SHARE lock on an
-- index build is observable. `Song` is bounded by a 10 GB audio cap. CREATE
-- INDEX CONCURRENTLY cannot run inside the transaction Prisma wraps a migration
-- in, so taking them concurrently would mean splitting this into a migration
-- plus a manual step for a lock nobody would notice.
-- migration-safety: acknowledged[add-column-with-default] every DEFAULT added
-- here is a constant, which Postgres 11+ applies as a catalogue-only change
-- rather than a table rewrite.

-- ─── C3: rating bookkeeping on the chart ───────────────────────────────────

ALTER TABLE "Chart"
  ADD COLUMN IF NOT EXISTS "ratingVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "ratedAt"       TIMESTAMP(3);

-- ─── R10: the ranked pool ──────────────────────────────────────────────────

ALTER TABLE "Chart"
  ADD COLUMN IF NOT EXISTS "rankStatus"   VARCHAR(16) NOT NULL DEFAULT 'unranked',
  ADD COLUMN IF NOT EXISTS "rankStatusAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rankStatusBy" TEXT;

-- Any row that already carried the old combined `status = 'ranked'` keeps its
-- visibility (it is public) and moves its rankedness onto the new axis. This is
-- a no-op on a database where nothing ever wrote that value, which is all of
-- them — the column shipped days ago and nothing set it — but writing the
-- backfill costs one statement and not writing it would silently drop a chart
-- out of the ranked pool if one did exist.
UPDATE "Chart"
   SET "rankStatus" = 'ranked',
       "status"     = 'public',
       "rankStatusAt" = COALESCE("rankStatusAt", CURRENT_TIMESTAMP)
 WHERE "status" = 'ranked';

CREATE INDEX IF NOT EXISTS "Chart_rankStatus_rating_idx"
  ON "Chart"("rankStatus", "rating");

CREATE INDEX IF NOT EXISTS "Chart_rating_idx"
  ON "Chart"("rating" DESC);

CREATE INDEX IF NOT EXISTS "Chart_ratingVersion_idx"
  ON "Chart"("ratingVersion");

-- ─── C3: the library's difficulty sort ─────────────────────────────────────

ALTER TABLE "Song"
  ADD COLUMN IF NOT EXISTS "chartRating" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "Song_isPublic_chartRating_idx"
  ON "Song"("isPublic", "chartRating" DESC);

-- ─── R2: the skill rating, beside the lifetime total and not replacing it ──

ALTER TABLE "Player"
  ADD COLUMN IF NOT EXISTS "skillRating"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rankedPlays"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "skillRatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Player_skillRating_idx"
  ON "Player"("skillRating" DESC);

-- Slice It: teach the leaderboard backfill about `perfectionist` and
-- `lenientTiming` (follow-up to 20260806160500_slice_it_leaderboard_rekey).
--
-- ## Why a second migration instead of editing the first one
--
-- The `CASE` in `20260806160500_.../migration.sql` is the SQL mirror of
-- `poolOfStoredRow()` in `lib/slice-it/pools.ts` — that file's own comment says
-- "change one, change the other". Two modifiers landed after the `CASE` was
-- written (`M6` perfect-or-die and `A9` lenient timing), `poolOfStoredRow` was
-- taught both, and the `CASE` was not. So the mirror is broken in two places:
--
--   * a stored row carrying `perfectionist` classifies as `none` — mixed in
--     with completely clean runs despite carrying the largest single-modifier
--     bonus in the game;
--   * a row carrying `lenientTiming` classifies as `none` or `standard`, when a
--     1.4x-wide judgement window makes it exactly as incomparable as
--     `strictTiming`, which the `CASE` already sorts into `challenge`.
--
-- The rekey migration has **not been applied anywhere yet** — it was
-- hand-written on this branch, this repository has no Postgres, and nothing has
-- run `migrate deploy` against it. Editing it in place would therefore have
-- worked. It is deliberately not edited, for two reasons:
--
--   1. `_prisma_migrations` stores a checksum of the file, so "has it run
--      anywhere?" is a claim about every database that exists — a laptop, a
--      restored backup, a review app — and it cannot be verified from inside
--      the repository. A migration that is correct only if a statement about
--      the outside world holds is a worse artefact than one that is correct
--      unconditionally.
--   2. The edit-in-place version and this file do the same thing on a fresh
--      database, and this one *also* does the right thing on a database that
--      already ran the first version. There is no case where editing wins.
--
-- On a fresh database this runs immediately after the rekey, matches zero rows
-- (nothing has been written yet) and costs one scan of a table bounded by "one
-- row per player per song per board".
--
-- ## The unique-key hazard, and why the delete comes first
--
-- `SongLeaderboard` is `UNIQUE ("songId", "difficulty", "modPool", "userId")`.
-- Re-classifying a row moves it across that key, so a plain `UPDATE` can
-- collide — with a row the player already holds in the destination pool (a
-- `perfectionist` run leaving `none` for `standard`, where their speed run
-- already sits), or with *another re-classified row* (two `lenientTiming` rows,
-- one in `none` and one in `standard`, both becoming `challenge`). Either would
-- abort the whole migration.
--
-- The board's contract is "one row per player per board, the best one", so the
-- resolution is the board's own rule: keep the highest score. A tie keeps the
-- row that is not moving — the one already on a board a player could see — and
-- then `id`, so the outcome does not depend on scan order.
--
-- The `row_number()` below is computed over the **whole** table rather than
-- over the moved rows alone, which is what makes it total: every partition that
-- is not gaining a row already holds exactly one (the unique index guarantees
-- it), so `rn > 1` is empty everywhere except where this migration moved
-- something. In practice it deletes nothing at all: both flags were added in
-- the same wave as this fix, so no stored row carries either one yet. It exists
-- because "no row carries this flag" is precisely the assumption that stops
-- being true the first time a database is restored from somewhere else.
--
-- ## `slice_run` needs nothing
--
-- Its `modPool` is written by `poolOf()` (the live path), which is already
-- right for both flags — `lenientTiming` is in `CHALLENGE_MODIFIERS`, and
-- `perfectionist` reaches `standard` through `activeModifierKeys`. The table is
-- also CREATEd empty by the rekey migration, so there is no history to fix.

-- ─── The corrected classification ───────────────────────────────────────────
--
-- The full mirror of `poolOfStoredRow()`, both new flags included, evaluated
-- for every row. For a row carrying neither flag it reproduces the original
-- `CASE` exactly, so `newPool` = `modPool` and nothing below touches it.

CREATE TEMPORARY VIEW slice_it_pool_target AS
  SELECT
    "id",
    "songId",
    "userId",
    "difficulty",
    "score",
    "modPool" AS "oldPool",
    CASE
      -- Challenge: anything that changes what the player SEES or how tight the
      -- windows are. `lenientTiming` is new here and belongs for the same
      -- reason `strictTiming` always did — it re-times every judgement.
      WHEN "modifiers"->>'invisible'     = 'true'
        OR "modifiers"->>'spin'          = 'true'
        OR "modifiers"->>'strictTiming'  = 'true'
        OR "modifiers"->>'lenientTiming' = 'true'
        OR "modifiers"->>'oneTrack'      = 'true'
        OR "modifiers"->>'switching'     = 'true'
        OR "modifiers"->>'bombs'         = 'true'
        THEN 'challenge'
      -- Standard: speed, and the risk gauges, which can only END a run early.
      -- `perfectionist` is new here and sits beside `suddenDeath` for exactly
      -- that reason: it never reveals, moves or re-times a note.
      WHEN "modifiers"->>'suddenDeath'   = 'true'
        OR "modifiers"->>'perfectionist' = 'true'
        OR "modifiers"->>'healthGauge'   = 'true'
        OR COALESCE("speedMod", 1.0) <> 1.0
        OR (   "modifiers"->>'speed' ~ '^[0-9]+(\.[0-9]+)?$'
           AND ("modifiers"->>'speed')::numeric <> 1 )
        THEN 'standard'
      ELSE 'none'
    END AS "newPool"
  FROM "SongLeaderboard";

-- ─── Collision resolution: one row per destination board, the best one ──────

DELETE FROM "SongLeaderboard" AS sl
USING (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "songId", "difficulty", "newPool", "userId"
      ORDER BY "score" DESC, ("newPool" = "oldPool") DESC, "id" ASC
    ) AS rn
  FROM slice_it_pool_target
) AS ranked
WHERE sl."id" = ranked."id"
  AND ranked.rn > 1;

-- ─── The re-classification ──────────────────────────────────────────────────

UPDATE "SongLeaderboard" AS sl
SET "modPool" = target."newPool"
FROM slice_it_pool_target AS target
WHERE sl."id" = target."id"
  AND sl."modPool" <> target."newPool";

DROP VIEW slice_it_pool_target;

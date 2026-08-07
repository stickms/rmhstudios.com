-- Slice It — O1's per-note miss aggregate.
--
-- HAND-WRITTEN, and verified statement-for-statement against
-- `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`,
-- which is the strongest check available with no Postgres in this environment.
-- It has never been executed. Review it as SQL, not as generated output.
--
--
-- Per-note counters rather than per-run rows: a run is ~1200 note results, and
-- at the volume `slice_run` already sees, the per-run form would be the largest
-- table in the database within a month. Only a sampled tenth of runs is counted.
--
-- `chart_hash` is part of the primary key on purpose. Note times are stable
-- across a regeneration only within one chart revision (C12), so an edit has to
-- start a fresh histogram instead of inheriting counts for notes that moved.
CREATE TABLE "slice_note_stat" (
    "chartId" UUID NOT NULL,
    "noteMs" INTEGER NOT NULL,
    "chartHash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "misses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slice_note_stat_pkey" PRIMARY KEY ("chartId", "chartHash", "noteMs")
);

-- The heatmap read: one chart revision, in time order. Redundant with the
-- primary key's leading columns for the equality part, but it carries `noteMs`
-- in sort order for the scan that draws the strip.
CREATE INDEX "slice_note_stat_chartId_chartHash_noteMs_idx"
    ON "slice_note_stat" ("chartId", "chartHash", "noteMs");

ALTER TABLE "slice_note_stat"
    ADD CONSTRAINT "slice_note_stat_chartId_fkey"
    FOREIGN KEY ("chartId") REFERENCES "Chart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── O3: charting as a queued job ──────────────────────────────────────────
--
-- Beatmap generation ran inline in the upload route. It is a pg-boss job now,
-- and this column is what the library reads to show "Charting…" instead of
-- hiding a row that has no chart yet.
--
-- `'ready'` as the default is deliberate: every existing row either has a chart
-- or has the null that the client's local-generation fallback already handles,
-- so nothing changes meaning. A constant DEFAULT is catalogue-only on PG 11+,
-- so `Song` is not rewritten.
ALTER TABLE "Song"
    ADD COLUMN IF NOT EXISTS "analysisState" VARCHAR(16) NOT NULL DEFAULT 'ready';

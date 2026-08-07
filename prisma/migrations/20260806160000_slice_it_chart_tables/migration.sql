-- Slice It chart editor (C1): the `Chart` and `ChartRevision` tables.
--
-- ## Why this migration exists separately, and later than the models
--
-- The two models landed in `prisma/schema.prisma` with the chart editor
-- (`a50c399a`, "Slice It: chart editor phases 1-3") and **no migration was
-- written for them**. `pnpm db:push` creates them locally, which is why the
-- editor works in development; `prisma migrate deploy` — which is what
-- `deploy.sh` runs — never would, so on any migrated database the editor's
-- first write fails with `relation "Chart" does not exist`.
--
-- It is broken out rather than folded into the leaderboard re-key beside it
-- because the two are independent: this one is the editor wave's missing half,
-- and the next one only *depends* on it (`SongLeaderboard.chartId` and
-- `slice_run.chartId` are foreign keys into `Chart`). Keeping them apart means
-- a bisect lands on the right change.
--
-- ## Shape notes
--
-- `Chart.id` is a UUID with a `gen_random_uuid()` column default, but the value
-- is normally minted application-side by `uuidv7()` in
-- `lib/slice-it/editor/uuid.ts` — an RFC 9562 UUIDv7, so inserts stay local
-- the way the new-table PK policy (`lib/CLAUDE.md` §Database) wants. The doc
-- asks for `uuid_generate_v7()` as the column default; that function is not
-- installed in this database, and the default here is only the fallback for a
-- row inserted without an id. See `docs/_handoff/chart-editor-requests.md` §2.
--
-- `IF NOT EXISTS` throughout, and the foreign keys are added inside a
-- `duplicate_object`-swallowing block, so an environment already patched by
-- `db push` applies this as a no-op instead of failing.
--
-- migration-safety: acknowledged[create-index-not-concurrent] every index here
-- is on a table CREATEd in this same migration, so it is empty and nothing else
-- can be writing to it — the SHARE lock is uncontended and the build is
-- instantaneous.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Chart" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "songId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "difficulty" VARCHAR(16) NOT NULL,
    "keys" INTEGER NOT NULL DEFAULT 2,
    "name" VARCHAR(64) NOT NULL,
    "notes" JSONB NOT NULL,
    "timingPoints" JSONB,
    "svPoints" JSONB,
    "chartHash" CHAR(64) NOT NULL,
    "rating" DOUBLE PRECISION,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "isGenerated" BOOLEAN NOT NULL DEFAULT true,
    "generatorVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChartRevision" (
    "id" BIGSERIAL NOT NULL,
    "chartId" UUID NOT NULL,
    "notes" JSONB NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "label" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Chart_songId_status_idx" ON "Chart"("songId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Chart_authorId_updatedAt_idx" ON "Chart"("authorId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Chart_songId_authorId_difficulty_keys_name_key"
  ON "Chart"("songId", "authorId", "difficulty", "keys", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChartRevision_chartId_createdAt_idx"
  ON "ChartRevision"("chartId", "createdAt" DESC);

-- AddForeignKey
DO $$
BEGIN
  ALTER TABLE "Chart" ADD CONSTRAINT "Chart_songId_fkey"
    FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Chart" ADD CONSTRAINT "Chart_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ChartRevision" ADD CONSTRAINT "ChartRevision_chartId_fkey"
    FOREIGN KEY ("chartId") REFERENCES "Chart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

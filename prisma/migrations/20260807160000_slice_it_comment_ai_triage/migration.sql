-- Slice It: advisory AI triage on song comments.
--
-- Song comments were the one place in the game where one player writes text
-- another player reads, and they had no moderation path at all — a comment went
-- from a textarea to every visitor's screen with nothing in between.
--
-- These four columns hold the verdict from `lib/slice-it/ai/moderation.server.ts`.
-- They are ADVISORY: nothing reads them to hide a comment or to block a post,
-- and the write path does not wait on the model. They exist to order a queue for
-- a human, which is the only thing a statistical classifier should be trusted
-- with on a comment section whose normal register is blunt criticism of a
-- beatmap.
--
-- All four are nullable and NULL is load-bearing. "Not triaged" (an outage, an
-- unconfigured key, or a row that predates this migration) must stay
-- distinguishable from "triaged and clean" (`aiSeverity = 'none'`); collapsing
-- them would make a provider outage read as a clean bill of health for every
-- comment posted during it. So there is no DEFAULT here on purpose.
--
-- `aiCategories` gets an empty-array default rather than NULL because it is only
-- ever written alongside a severity, and a Prisma `String[]` maps to a NOT NULL
-- array column — the absence of a triage is carried by `aiTriagedAt`.
--
-- IF NOT EXISTS throughout, so an environment already patched by `db push` is a
-- no-op rather than a failure.
--
-- migration-safety: acknowledged[create-index-not-concurrent] "SongComment" is
-- the per-song comment table — tens of thousands of rows at most, since a row is
-- a hand-typed comment on a user-uploaded track. The index builds in
-- milliseconds, and CREATE INDEX CONCURRENTLY cannot run inside the transaction
-- Prisma wraps a migration in, so taking it concurrently would mean splitting
-- this into a migration plus a manual step for a lock nobody would observe.

ALTER TABLE "SongComment" ADD COLUMN IF NOT EXISTS "aiSeverity" VARCHAR(16);
ALTER TABLE "SongComment" ADD COLUMN IF NOT EXISTS "aiCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SongComment" ADD COLUMN IF NOT EXISTS "aiRationale" VARCHAR(200);
ALTER TABLE "SongComment" ADD COLUMN IF NOT EXISTS "aiTriagedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SongComment_aiSeverity_createdAt_idx"
  ON "SongComment"("aiSeverity", "createdAt" DESC);

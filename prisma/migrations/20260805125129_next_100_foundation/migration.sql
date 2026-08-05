-- The Next 100 — foundation tables (docs/plans/2026-08-05-next-100-feature-ideas.md)
--
-- NOTE: the generated diff also proposed `DROP INDEX rmheet_content_tsv_idx`
-- and `ALTER TABLE rmheet DROP COLUMN content_tsv`. Both are removed here, for
-- the same reason 20260728130000_sync_wager_tournament_drift removed them:
-- `content_tsv` is a GENERATED tsvector created by
-- 20260717110700_add_search_trgm_fts and consumed by raw SQL in
-- lib/search/posts.server.ts. Prisma cannot model it, so every `migrate dev`
-- proposes the drop; accepting it silently destroys post full-text search.
-- Keep removing these two statements whenever they reappear.
--
-- migration-safety: acknowledged[create-index-not-concurrent] the three indexes on
-- pre-existing tables (session, user, rmheet_poll_vote) are built with a plain
-- CREATE INDEX to match this repo's existing index migrations and because Prisma
-- applies each migration inside a transaction, where CREATE INDEX CONCURRENTLY
-- cannot run (see 20260716000000_add_rmhark_feed_partial_index, which documents
-- the same trade-off). Each builds a small two-column b-tree and holds a SHARE
-- lock only for the build. If any of these tables has grown enough for that to
-- matter, build the index manually with CREATE INDEX CONCURRENTLY and then
-- `prisma migrate resolve --applied 20260805125129_next_100_foundation`.
--
-- Scoped to the index rule ON PURPOSE: a DROP COLUMN or a SET NOT NULL added to
-- this file later must still fail the check.

-- CreateEnum
CREATE TYPE "ActivityVerb" AS ENUM ('VIEWED', 'PLAYED', 'SAVED', 'COMPLETED', 'RATED', 'SHARED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DECLINED');

-- AlterTable
ALTER TABLE "rmheet_poll_vote" ADD COLUMN     "rank" INTEGER;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "alertedAt" TIMESTAMP(3),
ADD COLUMN     "deviceFp" VARCHAR(80),
ADD COLUMN     "ipHash" VARCHAR(64);

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "deletionScheduledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "site_idempotency_key" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotency" VARCHAR(255) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "statusCode" INTEGER,
    "responseBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "task" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "promptId" VARCHAR(60),
    "promptVer" INTEGER,
    "inTokens" INTEGER NOT NULL DEFAULT 0,
    "outTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "read_position" (
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "entityId" TEXT NOT NULL,
    "fraction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "anchorId" VARCHAR(120),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "read_position_pkey" PRIMARY KEY ("userId","kind","entityId")
);

-- CreateTable
CREATE TABLE "activity" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "verb" "ActivityVerb" NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_stat" (
    "id" BIGSERIAL NOT NULL,
    "gameId" VARCHAR(60) NOT NULL,
    "userId" TEXT NOT NULL,
    "username" VARCHAR(60),
    "score" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "plays" INTEGER NOT NULL DEFAULT 1,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "held_notification" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "channel" VARCHAR(10) NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" VARCHAR(160),
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flushedAt" TIMESTAMP(3),

    CONSTRAINT "held_notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_pref" (
    "userId" TEXT NOT NULL,
    "scopeKey" VARCHAR(80) NOT NULL,
    "muteUntil" TIMESTAMP(3),
    "mentionsOnly" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_pref_pkey" PRIMARY KEY ("userId","scopeKey")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" BIGSERIAL NOT NULL,
    "topic" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttempt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "deadAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backfill_checkpoint" (
    "name" VARCHAR(80) NOT NULL,
    "cursor" TEXT,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "backfill_checkpoint_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "achievement_rarity" (
    "achievementId" VARCHAR(80) NOT NULL,
    "holders" INTEGER NOT NULL DEFAULT 0,
    "pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_rarity_pkey" PRIMARY KEY ("achievementId")
);

-- CreateTable
CREATE TABLE "feature_request" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "officialNote" TEXT,
    "mergedIntoId" TEXT,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_request_vote" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_request_vote_pkey" PRIMARY KEY ("requestId","userId")
);

-- CreateIndex
CREATE INDEX "site_idempotency_key_createdAt_idx" ON "site_idempotency_key"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "site_idempotency_key_userId_idempotency_key" ON "site_idempotency_key"("userId", "idempotency");

-- CreateIndex
CREATE INDEX "ai_usage_userId_createdAt_idx" ON "ai_usage"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_usage_createdAt_idx" ON "ai_usage"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "read_position_userId_updatedAt_idx" ON "read_position"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "activity_userId_at_idx" ON "activity"("userId", "at" DESC);

-- CreateIndex
CREATE INDEX "activity_userId_verb_at_idx" ON "activity"("userId", "verb", "at" DESC);

-- CreateIndex
CREATE INDEX "activity_kind_entityId_at_idx" ON "activity"("kind", "entityId", "at" DESC);

-- CreateIndex
CREATE INDEX "game_stat_gameId_score_idx" ON "game_stat"("gameId", "score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "game_stat_gameId_userId_key" ON "game_stat"("gameId", "userId");

-- CreateIndex
CREATE INDEX "held_notification_userId_flushedAt_heldAt_idx" ON "held_notification"("userId", "flushedAt", "heldAt");

-- CreateIndex
CREATE INDEX "conversation_pref_userId_pinned_idx" ON "conversation_pref"("userId", "pinned");

-- CreateIndex
CREATE INDEX "outbox_event_deliveredAt_deadAt_nextAttempt_idx" ON "outbox_event"("deliveredAt", "deadAt", "nextAttempt");

-- CreateIndex
CREATE INDEX "outbox_event_topic_createdAt_idx" ON "outbox_event"("topic", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "achievement_rarity_pct_idx" ON "achievement_rarity"("pct");

-- CreateIndex
CREATE INDEX "feature_request_status_voteCount_idx" ON "feature_request"("status", "voteCount" DESC);

-- CreateIndex
CREATE INDEX "feature_request_authorId_createdAt_idx" ON "feature_request"("authorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "rmheet_poll_vote_userId_rank_idx" ON "rmheet_poll_vote"("userId", "rank");

-- CreateIndex
CREATE INDEX "session_userId_deviceFp_idx" ON "session"("userId", "deviceFp");

-- CreateIndex
CREATE INDEX "user_deletionScheduledAt_idx" ON "user"("deletionScheduledAt");

-- AddForeignKey
ALTER TABLE "site_idempotency_key" ADD CONSTRAINT "site_idempotency_key_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_position" ADD CONSTRAINT "read_position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity" ADD CONSTRAINT "activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_stat" ADD CONSTRAINT "game_stat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "held_notification" ADD CONSTRAINT "held_notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_pref" ADD CONSTRAINT "conversation_pref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_request" ADD CONSTRAINT "feature_request_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_request" ADD CONSTRAINT "feature_request_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "feature_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_request_vote" ADD CONSTRAINT "feature_request_vote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "feature_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_request_vote" ADD CONSTRAINT "feature_request_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

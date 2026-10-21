-- Admin-tunable bot-worker settings (/admin/bots). Additive only: a new table
-- the old image never reads, so it is safe across a blue/green swap. With no
-- row the Go bot-worker keeps using its BOT_* env defaults.
-- CreateTable
CREATE TABLE "bot_worker_settings" (
    "id" VARCHAR(20) NOT NULL DEFAULT 'default',
    "targetBotCount" INTEGER NOT NULL DEFAULT 20,
    "createBatch" INTEGER NOT NULL DEFAULT 6,
    "createIntervalMin" INTEGER NOT NULL DEFAULT 120,
    "postRateMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxPostsPerTick" INTEGER NOT NULL DEFAULT 5,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_worker_settings_pkey" PRIMARY KEY ("id")
);

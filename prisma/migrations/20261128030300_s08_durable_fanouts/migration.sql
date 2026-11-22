-- Durable fan-outs: one row per community post alert or event update fan-out, holding the lease, recipient cursor
-- and counters so a killed worker resumes where it stopped (lib/fanout/run.server.ts).

-- CreateEnum
CREATE TYPE "FanoutStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "fanout_run" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "subjectId" VARCHAR(64) NOT NULL,
    "cursor" TEXT,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "collapsed" INTEGER NOT NULL DEFAULT 0,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "status" "FanoutStatus" NOT NULL DEFAULT 'RUNNING',
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reclaims" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "fanout_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fanout_run_status_heartbeatAt_idx" ON "fanout_run"("status", "heartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "fanout_run_kind_subjectId_key" ON "fanout_run"("kind", "subjectId");


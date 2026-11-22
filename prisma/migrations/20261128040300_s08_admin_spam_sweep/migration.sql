-- Spam sweeps (sprint 08 18): an admin removes a member's posts and replies in a time window, durably and undoably.
-- Two new tables only: the sweep (with its lease and cursor) and the items it removed.
-- CreateTable
CREATE TABLE "moderation_sweep" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "includePosts" BOOLEAN NOT NULL DEFAULT true,
    "includeReplies" BOOLEAN NOT NULL DEFAULT true,
    "reason" VARCHAR(500) NOT NULL,
    "withStrike" BOOLEAN NOT NULL DEFAULT false,
    "strikeId" VARCHAR(40),
    "status" VARCHAR(12) NOT NULL DEFAULT 'PREVIEW',
    "phase" VARCHAR(8) NOT NULL DEFAULT 'remove',
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "removedCount" INTEGER NOT NULL DEFAULT 0,
    "restoredCount" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "queuedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),
    "undoneById" VARCHAR(40),
    "heartbeatAt" TIMESTAMP(3),
    "reclaims" INTEGER NOT NULL DEFAULT 0,
    "cursorType" VARCHAR(8),
    "cursorAt" TIMESTAMP(3),
    "cursorId" VARCHAR(40),

    CONSTRAINT "moderation_sweep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_sweep_item" (
    "sweepId" TEXT NOT NULL,
    "entityType" VARCHAR(8) NOT NULL,
    "entityId" VARCHAR(40) NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL,
    "undone" VARCHAR(8),

    CONSTRAINT "moderation_sweep_item_pkey" PRIMARY KEY ("sweepId","entityType","entityId")
);

-- CreateIndex
CREATE INDEX "moderation_sweep_status_heartbeatAt_idx" ON "moderation_sweep"("status", "heartbeatAt");

-- CreateIndex
CREATE INDEX "moderation_sweep_subjectId_createdAt_idx" ON "moderation_sweep"("subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_sweep_item_sweepId_undone_idx" ON "moderation_sweep_item"("sweepId", "undone");

-- AddForeignKey
ALTER TABLE "moderation_sweep" ADD CONSTRAINT "moderation_sweep_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_sweep" ADD CONSTRAINT "moderation_sweep_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_sweep_item" ADD CONSTRAINT "moderation_sweep_item_sweepId_fkey" FOREIGN KEY ("sweepId") REFERENCES "moderation_sweep"("id") ON DELETE CASCADE ON UPDATE CASCADE;


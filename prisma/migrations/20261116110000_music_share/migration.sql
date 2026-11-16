-- RMH Music Phase 6: shared results (the capability link /rmhmusic/r/<token> and its snapshot).
-- Additive only: one new table and its indexes. Nothing is backfilled: no result is shared until
-- its learner presses Copy link.

-- CreateTable
CREATE TABLE "music_share" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(32) NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "subject" VARCHAR(80) NOT NULL,
    "rowId" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "showName" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "stoppedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "music_share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "music_share_token_key" ON "music_share"("token");

-- CreateIndex
CREATE INDEX "music_share_userId_createdAt_idx" ON "music_share"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "music_share_expiresAt_idx" ON "music_share"("expiresAt");

-- AddForeignKey
ALTER TABLE "music_share" ADD CONSTRAINT "music_share_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

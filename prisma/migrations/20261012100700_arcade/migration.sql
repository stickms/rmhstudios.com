-- CreateTable
CREATE TABLE "arcade_seed_run" (
    "id" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "gameId" VARCHAR(48) NOT NULL,
    "seedKey" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER,
    "detail" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "arcade_seed_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_play_status" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "finishMinutes" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_play_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_tip" (
    "id" TEXT NOT NULL,
    "achievementId" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_tip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievement_tip_vote" (
    "tipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "achievement_tip_vote_pkey" PRIMARY KEY ("tipId","userId")
);

-- CreateTable
CREATE TABLE "game_patch_note" (
    "id" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_patch_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arcade_rival" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(48) NOT NULL,
    "rivalUserId" TEXT NOT NULL,
    "state" VARCHAR(8) NOT NULL DEFAULT 'ahead',
    "lastNotifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arcade_rival_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "arcade_seed_run_kind_gameId_seedKey_score_idx" ON "arcade_seed_run"("kind", "gameId", "seedKey", "score" DESC);

-- CreateIndex
CREATE INDEX "arcade_seed_run_userId_idx" ON "arcade_seed_run"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_seed_run_kind_gameId_seedKey_userId_key" ON "arcade_seed_run"("kind", "gameId", "seedKey", "userId");

-- CreateIndex
CREATE INDEX "game_play_status_gameId_status_idx" ON "game_play_status"("gameId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "game_play_status_userId_gameId_key" ON "game_play_status"("userId", "gameId");

-- CreateIndex
CREATE INDEX "achievement_tip_achievementId_votes_idx" ON "achievement_tip"("achievementId", "votes" DESC);

-- CreateIndex
CREATE INDEX "achievement_tip_userId_idx" ON "achievement_tip"("userId");

-- CreateIndex
CREATE INDEX "achievement_tip_vote_userId_idx" ON "achievement_tip_vote"("userId");

-- CreateIndex
CREATE INDEX "game_patch_note_gameId_createdAt_idx" ON "game_patch_note"("gameId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "game_patch_note_gameId_version_key" ON "game_patch_note"("gameId", "version");

-- CreateIndex
CREATE INDEX "arcade_rival_rivalUserId_idx" ON "arcade_rival"("rivalUserId");

-- CreateIndex
CREATE INDEX "arcade_rival_updatedAt_idx" ON "arcade_rival"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "arcade_rival_userId_gameId_key" ON "arcade_rival"("userId", "gameId");

-- AddForeignKey
ALTER TABLE "arcade_seed_run" ADD CONSTRAINT "arcade_seed_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_play_status" ADD CONSTRAINT "game_play_status_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_tip" ADD CONSTRAINT "achievement_tip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_tip_vote" ADD CONSTRAINT "achievement_tip_vote_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "achievement_tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_tip_vote" ADD CONSTRAINT "achievement_tip_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_rival" ADD CONSTRAINT "arcade_rival_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_rival" ADD CONSTRAINT "arcade_rival_rivalUserId_fkey" FOREIGN KEY ("rivalUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


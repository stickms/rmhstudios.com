-- AlterTable
ALTER TABLE "user" ADD COLUMN     "playtimeNoticeDismissedAt" TIMESTAMP(3),
ADD COLUMN     "playtimePrivacy" VARCHAR(10) NOT NULL DEFAULT 'public';

-- AlterTable
ALTER TABLE "community" ADD COLUMN     "gameId" VARCHAR(64);

-- CreateTable
CREATE TABLE "game_playtime" (
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "totalSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
    "lastPlayedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_playtime_pkey" PRIMARY KEY ("userId","gameId")
);

-- CreateTable
CREATE TABLE "game_playtime_day" (
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "day" DATE NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "game_playtime_day_pkey" PRIMARY KEY ("userId","gameId","day")
);

-- CreateIndex
CREATE INDEX "game_playtime_gameId_totalSeconds_idx" ON "game_playtime"("gameId", "totalSeconds" DESC);

-- CreateIndex
CREATE INDEX "game_playtime_day_userId_day_idx" ON "game_playtime_day"("userId", "day");

-- CreateIndex
CREATE INDEX "community_gameId_idx" ON "community"("gameId");

-- AddForeignKey
ALTER TABLE "game_playtime" ADD CONSTRAINT "game_playtime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_playtime_day" ADD CONSTRAINT "game_playtime_day_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

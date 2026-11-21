-- Game follows: a member following a game is told in-site about its patch notes and new guides.
-- Additive: one new table, its index and its cascade to the user.
-- CreateTable
CREATE TABLE "game_follow" (
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_follow_pkey" PRIMARY KEY ("userId","gameId")
);

-- CreateIndex
CREATE INDEX "game_follow_gameId_idx" ON "game_follow"("gameId");

-- AddForeignKey
ALTER TABLE "game_follow" ADD CONSTRAINT "game_follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


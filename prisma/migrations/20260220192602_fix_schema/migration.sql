-- CreateTable
CREATE TABLE "NeonDriftwayPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "bestDistance" INTEGER NOT NULL DEFAULT 0,
    "bestTimeMs" INTEGER NOT NULL DEFAULT 0,
    "bestLevel" INTEGER NOT NULL DEFAULT 1,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "NeonDriftwayPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NeonDriftwayPlayer_username_key" ON "NeonDriftwayPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "NeonDriftwayPlayer_userId_key" ON "NeonDriftwayPlayer"("userId");

-- CreateIndex
CREATE INDEX "idx_neon_driftway_high_score" ON "NeonDriftwayPlayer"("highScore" DESC);

-- AddForeignKey
ALTER TABLE "NeonDriftwayPlayer" ADD CONSTRAINT "NeonDriftwayPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

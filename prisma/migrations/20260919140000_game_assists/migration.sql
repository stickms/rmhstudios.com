-- The cross-game assist layer (P7).

-- CreateTable
CREATE TABLE "game_assist_preference" (
    "userId" TEXT NOT NULL,
    "holdToPress" BOOLEAN NOT NULL DEFAULT false,
    "speedFloorPerMille" INTEGER NOT NULL DEFAULT 1000,
    "calmVisuals" BOOLEAN NOT NULL DEFAULT false,
    "colorSafe" BOOLEAN NOT NULL DEFAULT false,
    "noTimedInput" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_assist_preference_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "game_assist_preference" ADD CONSTRAINT "game_assist_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

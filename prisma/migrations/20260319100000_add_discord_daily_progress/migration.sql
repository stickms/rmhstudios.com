-- CreateTable
CREATE TABLE "discord_daily_progress" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "gridJson" TEXT NOT NULL,
    "moves" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "ratingLabel" TEXT,
    "ratingEmoji" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_daily_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_daily_progress_discordId_dateKey_key" ON "discord_daily_progress"("discordId", "dateKey");

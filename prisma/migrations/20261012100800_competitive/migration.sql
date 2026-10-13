-- AlterEnum
ALTER TYPE "TournamentFormat" ADD VALUE 'SWISS';

-- AlterTable
ALTER TABLE "tournament" ADD COLUMN     "swissRounds" INTEGER;

-- CreateTable
CREATE TABLE "bracket_pick" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entrantId" TEXT NOT NULL,
    "role" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bracket_pick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_jam" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "theme" VARCHAR(120) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "submitEndsAt" TIMESTAMP(3) NOT NULL,
    "ratingEndsAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_jam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_jam_entry" (
    "id" TEXT NOT NULL,
    "jamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_jam_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_jam_rating" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "fun" INTEGER NOT NULL,
    "creativity" INTEGER NOT NULL,
    "theme" INTEGER NOT NULL,
    "polish" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_jam_rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_night" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "minutesPerGame" INTEGER NOT NULL,
    "games" JSONB NOT NULL DEFAULT '[]',
    "lobbyCodes" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_night_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendly_challenge" (
    "id" TEXT NOT NULL,
    "game" VARCHAR(40) NOT NULL,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "handicapKind" VARCHAR(16),
    "handicapAmount" INTEGER NOT NULL DEFAULT 0,
    "handicapUserId" TEXT,
    "ratingGap" INTEGER NOT NULL DEFAULT 0,
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "friendly_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bracket_pick_tournamentId_userId_idx" ON "bracket_pick"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "bracket_pick_tournamentId_userId_entrantId_key" ON "bracket_pick"("tournamentId", "userId", "entrantId");

-- CreateIndex
CREATE UNIQUE INDEX "game_jam_slug_key" ON "game_jam"("slug");

-- CreateIndex
CREATE INDEX "game_jam_startsAt_idx" ON "game_jam"("startsAt");

-- CreateIndex
CREATE INDEX "game_jam_entry_userId_idx" ON "game_jam_entry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "game_jam_entry_jamId_userId_key" ON "game_jam_entry"("jamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "game_jam_entry_jamId_buildId_key" ON "game_jam_entry"("jamId", "buildId");

-- CreateIndex
CREATE INDEX "game_jam_rating_raterId_idx" ON "game_jam_rating"("raterId");

-- CreateIndex
CREATE UNIQUE INDEX "game_jam_rating_entryId_raterId_key" ON "game_jam_rating"("entryId", "raterId");

-- CreateIndex
CREATE INDEX "game_night_enabled_idx" ON "game_night"("enabled");

-- CreateIndex
CREATE INDEX "friendly_challenge_opponentId_status_idx" ON "friendly_challenge"("opponentId", "status");

-- CreateIndex
CREATE INDEX "friendly_challenge_challengerId_status_idx" ON "friendly_challenge"("challengerId", "status");

-- AddForeignKey
ALTER TABLE "bracket_pick" ADD CONSTRAINT "bracket_pick_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bracket_pick" ADD CONSTRAINT "bracket_pick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bracket_pick" ADD CONSTRAINT "bracket_pick_entrantId_fkey" FOREIGN KEY ("entrantId") REFERENCES "tournament_entrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam" ADD CONSTRAINT "game_jam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_entry" ADD CONSTRAINT "game_jam_entry_jamId_fkey" FOREIGN KEY ("jamId") REFERENCES "game_jam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_entry" ADD CONSTRAINT "game_jam_entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_entry" ADD CONSTRAINT "game_jam_entry_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "user_build"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_rating" ADD CONSTRAINT "game_jam_rating_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "game_jam_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_jam_rating" ADD CONSTRAINT "game_jam_rating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendly_challenge" ADD CONSTRAINT "friendly_challenge_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendly_challenge" ADD CONSTRAINT "friendly_challenge_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


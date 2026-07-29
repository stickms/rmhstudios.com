-- Sync the remaining schema/migration drift: wagers, tournaments, and the
-- prediction auto-resolution columns.
--
-- 20260728000000_appearance_reduce_transparency fixed the one column whose
-- absence was visible in the UI (audit AUD-305). This covers the rest of the
-- same class of problem: features that shipped their schema with
-- `prisma db push` and never committed a migration, so a database built the way
-- production builds one (`prisma migrate deploy`) has no wager or tournament
-- tables at all — every query against them fails at runtime.
--
-- NOTE: the generated diff also proposes dropping `rmheet.content_tsv` and its
-- GIN index. Those are deliberately Prisma-invisible (a raw tsvector maintained
-- by 20260717110700_add_search_trgm_fts, which carries its own DO-NOT-DROP
-- warning), so both statements are removed here. Keep removing them if this
-- migration is ever regenerated.

-- CreateEnum
CREATE TYPE "WagerMatchStatus" AS ENUM ('OPEN', 'ACCEPTED', 'LIVE', 'SETTLED', 'DISPUTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SINGLE_ELIM', 'ROUND_ROBIN', 'DOUBLE_ELIM');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('REGISTRATION', 'LIVE', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TournamentMatchState" AS ENUM ('PENDING', 'READY', 'LIVE', 'COMPLETE', 'BYE');

-- AlterEnum
ALTER TYPE "CoinTxnType" ADD VALUE 'WAGER';

-- CreateTable
CREATE TABLE "wager_match" (
    "id" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "challengerId" TEXT NOT NULL,
    "opponentId" TEXT,
    "stakeCoins" INTEGER NOT NULL,
    "potCoins" INTEGER NOT NULL DEFAULT 0,
    "rakeBps" INTEGER NOT NULL DEFAULT 0,
    "status" "WagerMatchStatus" NOT NULL DEFAULT 'OPEN',
    "winnerId" TEXT,
    "challengerReportedWinnerId" TEXT,
    "opponentReportedWinnerId" TEXT,
    "resultSource" VARCHAR(24),
    "gameSessionRef" VARCHAR(96),
    "adminNote" VARCHAR(500),
    "acceptedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wager_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "format" "TournamentFormat" NOT NULL DEFAULT 'SINGLE_ELIM',
    "status" "TournamentStatus" NOT NULL DEFAULT 'REGISTRATION',
    "entryFeeCoins" INTEGER NOT NULL DEFAULT 0,
    "prizePoolCoins" INTEGER NOT NULL DEFAULT 0,
    "seedPoolCoins" INTEGER NOT NULL DEFAULT 0,
    "rakeBps" INTEGER NOT NULL DEFAULT 0,
    "maxPlayers" INTEGER NOT NULL DEFAULT 8,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'public',
    "createdById" TEXT NOT NULL,
    "seasonId" VARCHAR(64),
    "startsAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_entrant" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seed" INTEGER,
    "placement" INTEGER,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "eliminatedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_entrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "entrantAId" TEXT,
    "entrantBId" TEXT,
    "winnerEntrantId" TEXT,
    "state" "TournamentMatchState" NOT NULL DEFAULT 'PENDING',
    "nextMatchId" TEXT,
    "nextSlot" INTEGER,
    "gameSessionRef" VARCHAR(96),
    "resultSource" VARCHAR(24),
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_payout" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,
    "amountCoins" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wager_match_status_createdAt_idx" ON "wager_match"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "wager_match_challengerId_status_idx" ON "wager_match"("challengerId", "status");

-- CreateIndex
CREATE INDEX "wager_match_opponentId_status_idx" ON "wager_match"("opponentId", "status");

-- CreateIndex
CREATE INDEX "wager_match_gameId_status_idx" ON "wager_match"("gameId", "status");

-- CreateIndex
CREATE INDEX "wager_match_gameSessionRef_idx" ON "wager_match"("gameSessionRef");

-- CreateIndex
CREATE INDEX "tournament_status_startsAt_idx" ON "tournament"("status", "startsAt");

-- CreateIndex
CREATE INDEX "tournament_gameId_status_idx" ON "tournament"("gameId", "status");

-- CreateIndex
CREATE INDEX "tournament_entrant_tournamentId_seed_idx" ON "tournament_entrant"("tournamentId", "seed");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_entrant_tournamentId_userId_key" ON "tournament_entrant"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "tournament_match_tournamentId_state_idx" ON "tournament_match"("tournamentId", "state");

-- CreateIndex
CREATE INDEX "tournament_match_gameSessionRef_idx" ON "tournament_match"("gameSessionRef");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_match_tournamentId_round_slot_key" ON "tournament_match"("tournamentId", "round", "slot");

-- CreateIndex
CREATE INDEX "tournament_payout_userId_idx" ON "tournament_payout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_payout_tournamentId_userId_key" ON "tournament_payout"("tournamentId", "userId");

-- AddForeignKey
ALTER TABLE "wager_match" ADD CONSTRAINT "wager_match_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wager_match" ADD CONSTRAINT "wager_match_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wager_match" ADD CONSTRAINT "wager_match_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_entrant" ADD CONSTRAINT "tournament_entrant_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_entrant" ADD CONSTRAINT "tournament_entrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_entrantAId_fkey" FOREIGN KEY ("entrantAId") REFERENCES "tournament_entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_entrantBId_fkey" FOREIGN KEY ("entrantBId") REFERENCES "tournament_entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_winnerEntrantId_fkey" FOREIGN KEY ("winnerEntrantId") REFERENCES "tournament_entrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_payout" ADD CONSTRAINT "tournament_payout_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

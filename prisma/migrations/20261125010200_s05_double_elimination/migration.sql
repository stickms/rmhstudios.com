-- Double-elimination tournaments: each match records its bracket (W/L/GF/GR) and where its loser drops to.
-- Additive columns only; the default is constant, so existing rows become winners-bracket matches.
-- AlterTable
ALTER TABLE "tournament_match" ADD COLUMN     "bracket" VARCHAR(2) NOT NULL DEFAULT 'W',
ADD COLUMN     "loserNextMatchId" TEXT,
ADD COLUMN     "loserNextSlot" INTEGER;


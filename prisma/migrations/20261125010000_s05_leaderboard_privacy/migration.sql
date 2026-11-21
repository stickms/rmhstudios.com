-- Sprint 05 #01 leaderboard privacy: a member can leave every public game board
-- (read through lib/game/leaderboard-privacy.server.ts). Metadata-only, defaulted.

-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "hideFromLeaderboards" BOOLEAN NOT NULL DEFAULT false;

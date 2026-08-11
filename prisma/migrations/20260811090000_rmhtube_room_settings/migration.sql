-- Room settings that only ever lived in the hub's memory, so every restart
-- reverted them. Defaults match the in-memory defaults, so existing rooms keep
-- behaving exactly as they did before this migration.
ALTER TABLE "rmhtube_room" ADD COLUMN "queueVoting" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rmhtube_room" ADD COLUMN "autoSortByVotes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rmhtube_room" ADD COLUMN "loopQueue" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "rmhtube_room" ADD COLUMN "customReactions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "rmhtube_room" ADD COLUMN "waitForSlowPeers" BOOLEAN NOT NULL DEFAULT true;

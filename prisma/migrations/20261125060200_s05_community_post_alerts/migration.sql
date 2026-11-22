-- s05-17 community post alerts: a per-membership "post alerts" choice (off by default) and the one-row-per-post
-- claim table that makes the fan-out job run once per post. The index on the choice is its own migration.

-- AlterTable
ALTER TABLE "community_member" ADD COLUMN     "postAlerts" VARCHAR(4) NOT NULL DEFAULT 'off';

-- CreateTable
CREATE TABLE "community_post_alert_run" (
    "postId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_alert_run_pkey" PRIMARY KEY ("postId")
);

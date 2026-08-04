-- Massive March — host-owned campaign saves, and who has walked them.
--
-- One row per island. The whole world state (puzzle runtimes, tower deposits,
-- keys, unlocks, the day/night clock) is the `saveData` blob written by the
-- socket hub; `deposited`, `solved` and `finished` are surfaced as real columns
-- only so the campaign picker can list saves without deserialising every one.
--
-- The membership table exists so a player who is NOT the host can find their way
-- back to a campaign. They cannot start it — §6.1 is explicit that the host owns
-- the save and has to be present — but they should not have to keep the join
-- code in a text file either.
--
-- IF NOT EXISTS throughout so re-running against a database that already has the
-- tables is a no-op.

-- CreateTable
CREATE TABLE IF NOT EXISTS "massive_march_campaign" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'duo',
    "saveData" JSONB NOT NULL,
    "deposited" INTEGER NOT NULL DEFAULT 0,
    "solved" INTEGER NOT NULL DEFAULT 0,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "massive_march_campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "massive_march_member" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "massive_march_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the join code is the only way in, so it has to be unique.
CREATE UNIQUE INDEX IF NOT EXISTS "massive_march_campaign_code_key" ON "massive_march_campaign"("code");

-- CreateIndex: the picker lists an owner's campaigns, most recent first.
CREATE INDEX IF NOT EXISTS "idx_massive_march_owner" ON "massive_march_campaign"("ownerId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "massive_march_member_campaignId_userId_key" ON "massive_march_member"("campaignId", "userId");

-- CreateIndex: and the same list from the other side — walks I have been on.
CREATE INDEX IF NOT EXISTS "idx_massive_march_member_user" ON "massive_march_member"("userId", "lastSeenAt" DESC);

-- AddForeignKey. `ADD CONSTRAINT` has no IF NOT EXISTS in Postgres, so the
-- catalog is checked first to keep the whole migration re-runnable.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'massive_march_campaign_ownerId_fkey'
    ) THEN
        ALTER TABLE "massive_march_campaign"
            ADD CONSTRAINT "massive_march_campaign_ownerId_fkey"
            FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'massive_march_member_campaignId_fkey'
    ) THEN
        ALTER TABLE "massive_march_member"
            ADD CONSTRAINT "massive_march_member_campaignId_fkey"
            FOREIGN KEY ("campaignId") REFERENCES "massive_march_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'massive_march_member_userId_fkey'
    ) THEN
        ALTER TABLE "massive_march_member"
            ADD CONSTRAINT "massive_march_member_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Community moderation log: one append-only row per moderation action, written in the
-- action's own transaction, plus the community switch that opens its content part to members.

-- AlterTable
ALTER TABLE "community" ADD COLUMN     "publicModLog" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "community_mod_action" (
    "id" BIGSERIAL NOT NULL,
    "communityId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" VARCHAR(32) NOT NULL,
    "targetUserId" TEXT,
    "targetType" VARCHAR(16),
    "targetId" VARCHAR(64),
    "ruleId" TEXT,
    "ruleTitle" VARCHAR(60),
    "reason" VARCHAR(300),
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_mod_action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_mod_action_communityId_createdAt_idx" ON "community_mod_action"("communityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "community_mod_action_communityId_actorId_createdAt_idx" ON "community_mod_action"("communityId", "actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "community_mod_action" ADD CONSTRAINT "community_mod_action_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;


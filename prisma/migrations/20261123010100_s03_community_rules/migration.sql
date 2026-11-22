-- Community rules: an ordered list per community, an optional "require agreement" switch,
-- and the time a member ticked it. Reports to moderators reuse community_mod_item.

-- AlterTable
ALTER TABLE "community" ADD COLUMN     "rulesRequireAgreement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "community_member" ADD COLUMN     "rulesAcceptedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "community_rule" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "description" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_rule_communityId_position_idx" ON "community_rule"("communityId", "position");

-- AddForeignKey
ALTER TABLE "community_rule" ADD CONSTRAINT "community_rule_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;


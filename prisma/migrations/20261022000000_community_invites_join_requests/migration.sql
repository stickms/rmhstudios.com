-- Private-community invite links and join requests (additive: two new tables,
-- one new enum, no change to any existing table).
--
-- Query that needs the indexes: community_invite by communityId (mod list);
-- community_join_request by (communityId, status, createdAt desc) (pending
-- list) and unique (communityId, userId) (a user's own request, upsert).

-- CreateEnum
CREATE TYPE "CommunityJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "community_invite" (
    "id" BIGSERIAL NOT NULL,
    "communityId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_join_request" (
    "id" BIGSERIAL NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" VARCHAR(280),
    "status" "CommunityJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_join_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_invite_code_key" ON "community_invite"("code");

-- CreateIndex
CREATE INDEX "community_invite_communityId_idx" ON "community_invite"("communityId");

-- CreateIndex
CREATE INDEX "community_join_request_communityId_status_createdAt_idx" ON "community_join_request"("communityId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "community_join_request_communityId_userId_key" ON "community_join_request"("communityId", "userId");

-- AddForeignKey
ALTER TABLE "community_invite" ADD CONSTRAINT "community_invite_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invite" ADD CONSTRAINT "community_invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_join_request" ADD CONSTRAINT "community_join_request_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_join_request" ADD CONSTRAINT "community_join_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


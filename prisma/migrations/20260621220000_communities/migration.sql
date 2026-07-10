-- CreateEnum
CREATE TYPE "CommunityRole" AS ENUM ('MEMBER', 'MOD', 'ADMIN');

-- AlterTable
ALTER TABLE "rmheet" ADD COLUMN "communityId" TEXT;

-- CreateTable
CREATE TABLE "community" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(500),
    "color" VARCHAR(16),
    "icon" VARCHAR(8),
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "community_slug_key" ON "community"("slug");
CREATE INDEX "community_memberCount_idx" ON "community"("memberCount" DESC);

-- CreateTable
CREATE TABLE "community_member" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CommunityRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_member_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "community_member_communityId_userId_key" ON "community_member"("communityId", "userId");
CREATE INDEX "community_member_userId_idx" ON "community_member"("userId");

-- AddForeignKey
ALTER TABLE "rmheet" ADD CONSTRAINT "rmheet_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "community" ADD CONSTRAINT "community_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_member" ADD CONSTRAINT "community_member_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_member" ADD CONSTRAINT "community_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

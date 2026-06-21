-- CreateEnum
CREATE TYPE "ClanRole" AS ENUM ('OWNER', 'OFFICER', 'MEMBER');

-- CreateTable
CREATE TABLE "clan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "tag" VARCHAR(6) NOT NULL,
    "description" VARCHAR(300),
    "color" VARCHAR(16),
    "ownerId" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 1,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clan_slug_key" ON "clan"("slug");
CREATE INDEX "clan_totalXp_idx" ON "clan"("totalXp" DESC);
ALTER TABLE "clan" ADD CONSTRAINT "clan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "clan_member" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClanRole" NOT NULL DEFAULT 'MEMBER',
    "contributedXp" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clan_member_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clan_member_userId_key" ON "clan_member"("userId");
CREATE INDEX "clan_member_clanId_idx" ON "clan_member"("clanId");
ALTER TABLE "clan_member" ADD CONSTRAINT "clan_member_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clan_member" ADD CONSTRAINT "clan_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

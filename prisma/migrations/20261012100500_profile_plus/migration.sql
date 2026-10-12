-- P05 profiles (P1-P10): profile_plus, profile_visit_day, stamp, profile_stamp, webring,
-- webring_member, skill_endorsement. Additive only: new tables, indexes and foreign keys.

-- CreateTable
CREATE TABLE "profile_plus" (
    "userId" TEXT NOT NULL,
    "pronouns" VARCHAR(40),
    "timezone" VARCHAR(64),
    "nowText" VARCHAR(500),
    "nowUpdatedAt" TIMESTAMP(3),
    "pronunciationKey" VARCHAR(200),
    "pronunciationMs" INTEGER,
    "counterEnabled" BOOLEAN NOT NULL DEFAULT false,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_plus_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "profile_visit_day" (
    "profileId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "visitor" VARCHAR(40) NOT NULL,

    CONSTRAINT "profile_visit_day_pkey" PRIMARY KEY ("profileId","day","visitor")
);

-- CreateTable
CREATE TABLE "stamp" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "imageKey" VARCHAR(200) NOT NULL,
    "imageUrl" VARCHAR(300) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "addCount" INTEGER NOT NULL DEFAULT 0,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stamp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_stamp" (
    "userId" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_stamp_pkey" PRIMARY KEY ("userId","stampId")
);

-- CreateTable
CREATE TABLE "webring" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(280),
    "ownerId" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webring_member" (
    "ringId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webring_member_pkey" PRIMARY KEY ("ringId","userId")
);

-- CreateTable
CREATE TABLE "skill_endorsement" (
    "endorserId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "skill" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_endorsement_pkey" PRIMARY KEY ("endorserId","targetId","skill")
);

-- CreateIndex
CREATE INDEX "profile_visit_day_day_idx" ON "profile_visit_day"("day");

-- CreateIndex
CREATE INDEX "stamp_creatorId_createdAt_idx" ON "stamp"("creatorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "stamp_removedAt_createdAt_idx" ON "stamp"("removedAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "stamp_removedAt_addCount_idx" ON "stamp"("removedAt", "addCount" DESC);

-- CreateIndex
CREATE INDEX "profile_stamp_stampId_idx" ON "profile_stamp"("stampId");

-- CreateIndex
CREATE INDEX "profile_stamp_userId_createdAt_idx" ON "profile_stamp"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webring_slug_key" ON "webring"("slug");

-- CreateIndex
CREATE INDEX "webring_ownerId_idx" ON "webring"("ownerId");

-- CreateIndex
CREATE INDEX "webring_removedAt_memberCount_idx" ON "webring"("removedAt", "memberCount" DESC);

-- CreateIndex
CREATE INDEX "webring_member_userId_idx" ON "webring_member"("userId");

-- CreateIndex
CREATE INDEX "webring_member_ringId_joinedAt_idx" ON "webring_member"("ringId", "joinedAt");

-- CreateIndex
CREATE INDEX "skill_endorsement_targetId_skill_idx" ON "skill_endorsement"("targetId", "skill");

-- AddForeignKey
ALTER TABLE "profile_plus" ADD CONSTRAINT "profile_plus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_visit_day" ADD CONSTRAINT "profile_visit_day_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile_plus"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stamp" ADD CONSTRAINT "stamp_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_stamp" ADD CONSTRAINT "profile_stamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_stamp" ADD CONSTRAINT "profile_stamp_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webring" ADD CONSTRAINT "webring_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webring_member" ADD CONSTRAINT "webring_member_ringId_fkey" FOREIGN KEY ("ringId") REFERENCES "webring"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webring_member" ADD CONSTRAINT "webring_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_endorsement" ADD CONSTRAINT "skill_endorsement_endorserId_fkey" FOREIGN KEY ("endorserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_endorsement" ADD CONSTRAINT "skill_endorsement_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


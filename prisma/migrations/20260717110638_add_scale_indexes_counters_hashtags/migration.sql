-- Scalability pass: denormalized social counters, hashtag registry, and the
-- indexes that keep leaderboards / follower lists / presence off full scans.
--
-- NOTE: scoped intentionally to the scalability audit changes only. Other
-- unmigrated models present in schema.prisma (tournaments, wager matches,
-- redemptions, prediction resolver fields) are separate feature debt and are
-- deliberately NOT included here to avoid owning/duplicating that work.

-- AlterTable: denormalized comment counters (maintained by comment routes)
ALTER TABLE "rmheet_comment" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "replyCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: denormalized poll tally (maintained by the vote route)
ALTER TABLE "rmheet_poll_option" ADD COLUMN "voteCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: denormalized following/post counters (maintained on follow + post)
ALTER TABLE "user" ADD COLUMN "followingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "postCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: normalized hashtag registry
CREATE TABLE "hashtag" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateTable: post <-> hashtag join
CREATE TABLE "post_hashtag" (
    "id" TEXT NOT NULL,
    "hashtagId" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_hashtag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hashtag_tag_key" ON "hashtag"("tag");
CREATE INDEX "hashtag_postCount_idx" ON "hashtag"("postCount" DESC);
CREATE INDEX "post_hashtag_hashtagId_createdAt_idx" ON "post_hashtag"("hashtagId", "createdAt" DESC);
CREATE INDEX "post_hashtag_rmheetId_idx" ON "post_hashtag"("rmheetId");
CREATE UNIQUE INDEX "post_hashtag_hashtagId_rmheetId_key" ON "post_hashtag"("hashtagId", "rmheetId");

-- CreateIndex: keyset follower/following lists
CREATE INDEX "follow_followingId_createdAt_idx" ON "follow"("followingId", "createdAt" DESC);
CREATE INDEX "follow_followerId_createdAt_idx" ON "follow"("followerId", "createdAt" DESC);

-- CreateIndex: presence fallback + leaderboard scans
CREATE INDEX "user_lastSeenAt_idx" ON "user"("lastSeenAt");
CREATE INDEX "user_profile_xp_idx" ON "user_profile"("xp" DESC);
CREATE INDEX "user_profile_coins_idx" ON "user_profile"("coins" DESC);

-- AddForeignKey
ALTER TABLE "post_hashtag" ADD CONSTRAINT "post_hashtag_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "hashtag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_hashtag" ADD CONSTRAINT "post_hashtag_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill denormalized counters from existing data so they start consistent.
UPDATE "user" u SET "followingCount" = sub.c
  FROM (SELECT "followerId" AS uid, COUNT(*) AS c FROM "follow" GROUP BY "followerId") sub
  WHERE u.id = sub.uid;
UPDATE "user" u SET "postCount" = sub.c
  FROM (SELECT "userId" AS uid, COUNT(*) AS c FROM "rmheet" WHERE "deletedAt" IS NULL GROUP BY "userId") sub
  WHERE u.id = sub.uid;
UPDATE "rmheet_poll_option" o SET "voteCount" = sub.c
  FROM (SELECT "optionId" AS oid, COUNT(*) AS c FROM "rmheet_poll_vote" GROUP BY "optionId") sub
  WHERE o.id = sub.oid;
UPDATE "rmheet_comment" c SET "likeCount" = sub.c
  FROM (SELECT "commentId" AS cid, COUNT(*) AS c FROM "rmheet_comment_like" GROUP BY "commentId") sub
  WHERE c.id = sub.cid;
UPDATE "rmheet_comment" c SET "replyCount" = sub.c
  FROM (SELECT "parentId" AS pid, COUNT(*) AS c FROM "rmheet_comment" WHERE "parentId" IS NOT NULL AND "deletedAt" IS NULL GROUP BY "parentId") sub
  WHERE c.id = sub.pid;

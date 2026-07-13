-- Denormalized follower count on "user", kept in sync on follow/unfollow.
-- Backfilled once from the existing follow graph so recommendations and profile
-- cards can sort/read it directly instead of aggregating the follow relation.
ALTER TABLE "user" ADD COLUMN "followerCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "user" u
SET "followerCount" = c.count
FROM (
  SELECT "followingId" AS id, COUNT(*)::int AS count
  FROM "follow"
  GROUP BY "followingId"
) c
WHERE u."id" = c.id;

CREATE INDEX "user_followerCount_idx" ON "user"("followerCount");

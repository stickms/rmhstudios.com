/**
 * Reconcile the denormalized SOCIAL counters added in the scalability pass
 * against their source tables — the sibling of scripts/reconcile-feed-counts.ts.
 *
 * Maintained transactionally by the write paths, but denormalization always
 * drifts eventually (crashed transactions, direct DB edits, buffered/async
 * writers). This periodic sweep re-derives the truth and only writes rows that
 * are actually wrong, so a clean run touches zero rows.
 *
 *   user.followerCount   = # follows where followingId = user
 *   user.followingCount  = # follows where followerId  = user
 *   user.postCount       = # non-deleted rmheet by the user
 *   rmheet_poll_option.voteCount   = # votes for the option
 *   rmheet_comment.likeCount       = # likes on the comment
 *   rmheet_comment.replyCount      = # non-deleted direct replies
 *   hashtag.postCount              = # linked, non-deleted posts
 *
 * Run manually:   pnpm exec tsx scripts/reconcile-social-counts.ts
 * Run on a cron:  e.g. every 15–60 minutes (alongside the cleanup worker).
 */

import { prisma } from "@/lib/prisma.server";

async function main() {
  const startedAt = Date.now();

  const users = await prisma.$executeRawUnsafe(`
    UPDATE "user" u SET
      "followerCount"  = c.followers,
      "followingCount" = c.following,
      "postCount"      = c.posts
    FROM (
      SELECT
        u2."id",
        (SELECT COUNT(*) FROM "follow" f WHERE f."followingId" = u2."id")::int AS followers,
        (SELECT COUNT(*) FROM "follow" f WHERE f."followerId"  = u2."id")::int AS following,
        (SELECT COUNT(*) FROM "rmheet" r WHERE r."userId" = u2."id" AND r."deletedAt" IS NULL)::int AS posts
      FROM "user" u2
    ) c
    WHERE u."id" = c."id" AND (
      u."followerCount"  <> c.followers OR
      u."followingCount" <> c.following OR
      u."postCount"      <> c.posts
    );
  `);

  const pollOptions = await prisma.$executeRawUnsafe(`
    UPDATE "rmheet_poll_option" o SET "voteCount" = c.votes
    FROM (
      SELECT o2."id", (SELECT COUNT(*) FROM "rmheet_poll_vote" v WHERE v."optionId" = o2."id")::int AS votes
      FROM "rmheet_poll_option" o2
    ) c
    WHERE o."id" = c."id" AND o."voteCount" <> c.votes;
  `);

  const comments = await prisma.$executeRawUnsafe(`
    UPDATE "rmheet_comment" cm SET
      "likeCount"  = c.likes,
      "replyCount" = c.replies
    FROM (
      SELECT
        cm2."id",
        (SELECT COUNT(*) FROM "rmheet_comment_like" l WHERE l."commentId" = cm2."id")::int AS likes,
        (SELECT COUNT(*) FROM "rmheet_comment" rp WHERE rp."parentId" = cm2."id" AND rp."deletedAt" IS NULL)::int AS replies
      FROM "rmheet_comment" cm2
    ) c
    WHERE cm."id" = c."id" AND (cm."likeCount" <> c.likes OR cm."replyCount" <> c.replies);
  `);

  const hashtags = await prisma.$executeRawUnsafe(`
    UPDATE "hashtag" h SET "postCount" = c.posts
    FROM (
      SELECT h2."id",
        (SELECT COUNT(*) FROM "post_hashtag" ph
           JOIN "rmheet" r ON r."id" = ph."rmheetId"
           WHERE ph."hashtagId" = h2."id" AND r."deletedAt" IS NULL)::int AS posts
      FROM "hashtag" h2
    ) c
    WHERE h."id" = c."id" AND h."postCount" <> c.posts;
  `);

  const ms = Date.now() - startedAt;
  console.log(
    `[reconcile-social-counts] corrected users=${users} pollOptions=${pollOptions} ` +
      `comments=${comments} hashtags=${hashtags} in ${ms}ms`
  );
}

main()
  .catch((e) => {
    console.error("[reconcile-social-counts] failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

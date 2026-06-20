/**
 * Reconcile the denormalized RMHark engagement counters against the source
 * tables (Phase 1 of docs/feed/plan.md).
 *
 * The like/comment/repost/view routes maintain `likeCount`, `commentCount`,
 * `repostCount`, and `viewCount` transactionally, but denormalization always
 * drifts eventually (crashed transactions, direct DB edits, out-of-band
 * writers). This is the periodic correction job — Twitter's "counts update
 * asynchronously, drift is tolerated, a sweep re-derives the truth" model.
 *
 * Run manually:   pnpm exec tsx scripts/reconcile-feed-counts.ts
 * Run on a cron:  e.g. every 15 minutes.
 *
 * It re-derives every counter in a single set-based UPDATE and only writes the
 * rows that were actually wrong, so a clean run touches zero rows.
 *
 * Note: commentCount counts ALL comment rows (including soft-deleted) to match
 * the historical `_count` semantics the feed relied on before denormalization.
 */

import { prisma } from "@/lib/prisma.server";

async function main() {
  const startedAt = Date.now();

  const corrected = await prisma.$executeRawUnsafe(`
    UPDATE "rmheet" r SET
      "likeCount"    = c.likes,
      "commentCount" = c.comments,
      "repostCount"  = c.reposts,
      "viewCount"    = c.views
    FROM (
      SELECT
        r2."id",
        (SELECT COUNT(*) FROM "rmheet_like"    l  WHERE l."rmheetId"  = r2."id")::int AS likes,
        (SELECT COUNT(*) FROM "rmheet_comment" cm WHERE cm."rmheetId" = r2."id")::int AS comments,
        (SELECT COUNT(*) FROM "rmheet_repost"  rp WHERE rp."rmheetId" = r2."id")::int AS reposts,
        (SELECT COUNT(*) FROM "rmheet_view"    v  WHERE v."rmheetId"  = r2."id")::int AS views
      FROM "rmheet" r2
    ) c
    WHERE r."id" = c."id" AND (
      r."likeCount"    <> c.likes    OR
      r."commentCount" <> c.comments OR
      r."repostCount"  <> c.reposts  OR
      r."viewCount"    <> c.views
    );
  `);

  const ms = Date.now() - startedAt;
  console.log(
    `[reconcile-feed-counts] corrected ${corrected} drifted RMHark${corrected === 1 ? "" : "s"} in ${ms}ms`
  );
}

main()
  .catch((e) => {
    console.error("[reconcile-feed-counts] failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

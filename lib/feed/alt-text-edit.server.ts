/**
 * Describe images after posting (sprint 05 #16) — server half.
 *
 * `updatePostAlts` rewrites `RMHark.imageAlts` for the author. It is accessibility metadata, not a content edit: it
 * writes no `RMHarkEdit` row, leaves `editedAt` alone (so no "edited" marker) and has no age limit. Every read path
 * (feed mapping, post page, embed, `/api/v1`) reads `imageAlts` from the row, and a cached first page of a timeline is
 * re-read from the row when it is served (`page-reconcile.server.ts`), so nothing here has to bust a cache.
 *
 * `listPostsMissingAlts` is the settings list: the caller's own live posts with an image that has no description,
 * newest first. SQL narrows to posts with images, keyset pages of 100; the JS `missingAltIndexes` decides which of
 * them qualify, so one definition of "missing" is shared with the composer.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { normalizeGifAlt } from '@/lib/feed/gif-alt';
import { getCommunitySettings } from '@/lib/communities/settings.server';
import { ALT_REQUIRED_MESSAGE, clearsDescription, communityGifAltMissing } from '@/lib/communities/alt-required';
import { isLocked } from '@/lib/feed/map-feed-item.server';
import {
  MISSING_ALT_BATCH_SIZE,
  MISSING_ALT_COUNT_CAP,
  MISSING_ALT_MAX_BATCHES,
  MISSING_ALT_PAGE_SIZE,
  alignAlts,
  altsMatchImages,
  capMissingCount,
  decodeCursor,
  encodeCursor,
  firstLineOf,
  missingAltCount,
  sanitizeAlts,
  type MissingAltPage,
  type MissingAltRow,
} from '@/lib/feed/alt-text-edit';

/** Blank = JS `String.prototype.trim()` leaves nothing: ASCII whitespace plus NBSP, Unicode spaces, BOM. */
const BLANK_ALT_PATTERN = '^[\\s\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]*$';

export type UpdatePostAltsResult =
  | {
      ok: true;
      imageAlts: string[];
      /** The GIF's description after the write; undefined when the post has no GIF. */
      gifAlt?: string | null;
    }
  | {
      ok: false;
      status: 400 | 403 | 404;
      error: string;
    };

const fail = (status: 400 | 403 | 404, error: string): UpdatePostAltsResult => ({
  ok: false,
  status,
  error,
});

export async function updatePostAlts(args: {
  postId: string;
  userId: string;
  alts: readonly string[];
  /** The GIF's description (sprint 06 #15): undefined leaves it, null or blank clears it. */
  gifAlt?: string | null | undefined;
}): Promise<UpdatePostAltsResult> {
  const post = await prisma.rMHark.findUnique({
    where: {
      id: args.postId,
    },
    select: {
      id: true,
      userId: true,
      deletedAt: true,
      imageUrls: true,
      imageAlts: true,
      gifUrl: true,
      gifAlt: true,
      unlockPrice: true,
      expiresAt: true,
      communityId: true,
    },
  });
  // Removed (by the author or a moderator) or expired: not visible, so its descriptions are not editable either.
  if (!post || post.deletedAt || (post.expiresAt && post.expiresAt.getTime() <= Date.now()))
    return fail(404, 'Not found');
  if (post.userId !== args.userId) return fail(403, 'Forbidden');
  // The same rule the post GET uses to withhold a post's media from a viewer.
  if (isLocked(post, args.userId)) return fail(403, 'This post is locked');
  const hasImages = post.imageUrls.length > 0;
  const hasGif = !!post.gifUrl;
  const gifGiven = args.gifAlt !== undefined;
  if (!hasImages && !hasGif) return fail(400, 'This post has no images');
  if (gifGiven && !hasGif) return fail(400, 'This post has no GIF');
  // Images need exactly one description each; a post with only a GIF sends none.
  if (
    hasImages
      ? !altsMatchImages(post.imageUrls, args.alts) && !(hasGif && gifGiven && args.alts.length === 0)
      : args.alts.length > 0
  )
    return fail(400, 'Provide exactly one description per image');
  const writesImages = hasImages && args.alts.length > 0;
  if (!writesImages && !gifGiven) return fail(400, 'Provide exactly one description per image');

  const imageAlts = writesImages ? sanitizeAlts(args.alts) : alignAlts(post.imageUrls, post.imageAlts);
  // s07-16: in a community that requires descriptions a description is never taken away (clearing one is refused).
  if (writesImages && post.communityId) {
    const community = await getCommunitySettings(post.communityId);
    if (community?.requireImageAlt && clearsDescription(post.imageAlts, imageAlts))
      return fail(400, ALT_REQUIRED_MESSAGE);
  }
  const gifAlt = gifGiven ? normalizeGifAlt(post.gifUrl, args.gifAlt) : undefined;
  // s07-16: a GIF's description is never taken away there either.
  if (gifAlt !== undefined && post.communityId) {
    const community = await getCommunitySettings(post.communityId);
    if (communityGifAltMissing(community?.requireImageAlt === true, post.gifUrl, gifAlt))
      return fail(400, ALT_REQUIRED_MESSAGE);
  }
  // The compare-and-set keeps a delete that lands between the read and the write from being undone by it.
  const written = await prisma.rMHark.updateMany({
    where: {
      id: post.id,
      userId: args.userId,
      deletedAt: null,
      // Refuse if the images changed since the read, so a description never lands on another picture.
      imageUrls: {
        equals: post.imageUrls,
      },
      // Likewise the GIF: a description is for the GIF it was written for.
      gifUrl: post.gifUrl,
    },
    data: {
      ...(writesImages
        ? {
            imageAlts,
          }
        : {}),
      ...(gifAlt !== undefined
        ? {
            gifAlt,
          }
        : {}),
    },
  });
  if (written.count === 0) return fail(404, 'Not found');
  return {
    ok: true,
    imageAlts,
    ...(gifAlt !== undefined
      ? {
          gifAlt,
        }
      : {}),
  };
}

/**
 * How many of the member's posts still have an undescribed image, stopping at one past the cap. The same test as
 * `missingAltIndexes`, written for Postgres: an alt that is absent (a short array reads NULL) or blank is missing.
 */
async function countMissing(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<
    {
      n: number;
    }[]
  >(Prisma.sql`
    SELECT count(*)::int AS n FROM (
      SELECT 1 FROM "rmheet"
      WHERE "userId" = ${userId}
        AND "deletedAt" IS NULL
        AND ("expiresAt" IS NULL OR "expiresAt" > now())
        AND cardinality("imageUrls") > 0
        AND EXISTS (
          SELECT 1 FROM generate_series(1, cardinality("imageUrls")) AS i
          WHERE coalesce("imageAlts"[i], '') ~ ${BLANK_ALT_PATTERN}
        )
      LIMIT ${MISSING_ALT_COUNT_CAP + 1}
    ) AS missing
  `);
  const n = Array.isArray(rows) ? (rows[0]?.n ?? 0) : 0;
  return n;
}

export async function listPostsMissingAlts(userId: string, after?: string | undefined): Promise<MissingAltPage> {
  const start = after ? decodeCursor(after) : null;
  const now = new Date();
  const rows: MissingAltRow[] = [];
  let cursor = start;
  let more = false;

  for (let batch = 0; batch < MISSING_ALT_MAX_BATCHES && rows.length < MISSING_ALT_PAGE_SIZE; batch++) {
    const candidates = await prisma.rMHark.findMany({
      where: {
        userId,
        deletedAt: null,
        NOT: {
          imageUrls: {
            isEmpty: true,
          },
        },
        AND: [
          {
            OR: [
              {
                expiresAt: null,
              },
              {
                expiresAt: {
                  gt: now,
                },
              },
            ],
          },
          ...(cursor
            ? [
                {
                  OR: [
                    {
                      createdAt: {
                        lt: cursor.createdAt,
                      },
                    },
                    {
                      createdAt: cursor.createdAt,
                      id: {
                        lt: cursor.id,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take: MISSING_ALT_BATCH_SIZE,
      select: {
        id: true,
        content: true,
        createdAt: true,
        imageUrls: true,
        imageAlts: true,
      },
    });

    for (let i = 0; i < candidates.length; i++) {
      const post = candidates[i]!;
      cursor = {
        createdAt: post.createdAt,
        id: post.id,
      };
      const missing = missingAltCount(post.imageUrls, post.imageAlts);
      if (missing === 0) continue;
      rows.push({
        id: post.id,
        firstLine: firstLineOf(post.content),
        createdAt: post.createdAt.toISOString(),
        imageUrls: post.imageUrls,
        imageAlts: alignAlts(post.imageUrls, post.imageAlts),
        missing,
      });
      if (rows.length === MISSING_ALT_PAGE_SIZE) {
        more = i < candidates.length - 1 || candidates.length === MISSING_ALT_BATCH_SIZE;
        break;
      }
    }
    if (rows.length === MISSING_ALT_PAGE_SIZE) break;
    // A short batch is the end of the member's posts with images.
    more = candidates.length === MISSING_ALT_BATCH_SIZE;
    if (!more) break;
  }

  const counted = start ? null : capMissingCount(await countMissing(userId));
  return {
    rows,
    total: counted?.count ?? null,
    capped: counted?.capped ?? false,
    nextCursor: more && cursor ? encodeCursor(cursor.createdAt, cursor.id) : null,
  };
}

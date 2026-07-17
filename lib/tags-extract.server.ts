/**
 * Hashtag extraction + linking — server-only.
 *
 * Replaces the old "scan rmheet.content with ILIKE '%#tag%'" approach: hashtags
 * are parsed once at write time and stored in the normalized hashtag /
 * post_hashtag tables (see prisma/schema.prisma), which trending and tag feeds
 * read via indexed lookups.
 *
 * Call `linkPostHashtags(tx, postId, content)` inside the post-create
 * transaction, and `unlinkPostHashtags(tx, postId)` when a post is deleted.
 */

import type { Prisma } from '@prisma/client';

/** Hashtags in a `.$transaction` accept either the client or a tx client. */
type Tx = Prisma.TransactionClient;

// A tag is '#', then 1–64 letters/numbers/underscores (Unicode-aware).
const TAG_RE = /#([\p{L}\p{N}_]{1,64})/gu;
const MAX_TAGS_PER_POST = 10;

/** Parse distinct, normalized (lowercased) hashtags from post content. */
export function extractHashtags(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(TAG_RE)) {
    const tag = m[1].toLowerCase();
    // Skip pure-number tags (#1, #2024) — usually not topical hashtags.
    if (/^\d+$/.test(tag)) continue;
    out.add(tag);
    if (out.size >= MAX_TAGS_PER_POST) break;
  }
  return [...out];
}

/**
 * Link a newly created post to the hashtags it contains, upserting the tag
 * registry and bumping each tag's denormalized postCount. Idempotent per
 * (tag, post) via the unique constraint; a duplicate link is ignored and does
 * not double-count.
 */
export async function linkPostHashtags(tx: Tx, postId: string, content: string): Promise<void> {
  const tags = extractHashtags(content);
  if (tags.length === 0) return;
  for (const tag of tags) {
    const hashtag = await tx.hashtag.upsert({
      where: { tag },
      create: { tag },
      update: {},
      select: { id: true },
    });
    const created = await tx.postHashtag
      .create({ data: { hashtagId: hashtag.id, rmheetId: postId }, select: { id: true } })
      .then(() => true)
      .catch(() => false); // unique violation → already linked
    if (created) {
      await tx.hashtag.update({
        where: { id: hashtag.id },
        data: { postCount: { increment: 1 } },
      });
    }
  }
}

/**
 * Remove a post's hashtag links and decrement the affected tags' postCount.
 * Call on hard delete; on soft delete it's optional (the read paths filter
 * deletedAt), but calling it keeps trending accurate.
 */
export async function unlinkPostHashtags(tx: Tx, postId: string): Promise<void> {
  const links = await tx.postHashtag.findMany({
    where: { rmheetId: postId },
    select: { hashtagId: true },
  });
  if (links.length === 0) return;
  await tx.postHashtag.deleteMany({ where: { rmheetId: postId } });
  for (const { hashtagId } of links) {
    await tx.hashtag.update({
      where: { id: hashtagId },
      data: { postCount: { decrement: 1 } },
    });
  }
}

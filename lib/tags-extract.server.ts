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

/**
 * Fold one raw tag string into exactly the form stored in the hashtag table, or
 * `''` when nothing usable is left.
 *
 * Anything that does not come out of `TAG_RE` — a tag typed into a picker, or
 * one suggested by `suggestHashtags` in `lib/ai/text.server` — has to pass
 * through here first, so a suggested `#Rust Lang!` becomes the same `rustlang`
 * row that writing `#rustlang` in a post would have created. Without a shared
 * normalizer the two paths drift and the tag feed splits in half.
 */
export function normalizeTag(raw: string): string {
  const tag = raw
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, 64);
  // Pure-number tags are dropped by `extractHashtags` too — not topical.
  return /^\d+$/.test(tag) ? '' : tag;
}

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

  // Set-at-a-time, not tag-at-a-time. The previous version issued three serial
  // queries per tag (upsert + create + update), so a 10-hashtag post ran 30
  // round trips *while holding the post-create interactive transaction* — the
  // transaction stayed open for the whole latency of all of them, pinning a pool
  // connection and blocking the author's response. This is a fixed five
  // statements regardless of tag count.
  await tx.hashtag.createMany({ data: tags.map((tag) => ({ tag })), skipDuplicates: true });

  // `tag` is unique, so this is one indexed read for the whole set.
  const rows = await tx.hashtag.findMany({ where: { tag: { in: tags } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;

  // Only *newly* linked tags may bump postCount. On the create path this is
  // always empty (the post id is brand new), but the same function is used when
  // a post's content is re-linked, and double-counting there would permanently
  // skew trending — so the set difference is computed rather than assumed.
  const existing = await tx.postHashtag.findMany({
    where: { rmheetId: postId, hashtagId: { in: ids } },
    select: { hashtagId: true },
  });
  const already = new Set(existing.map((e) => e.hashtagId));
  const fresh = ids.filter((id) => !already.has(id));
  if (fresh.length === 0) return;

  await tx.postHashtag.createMany({
    data: fresh.map((hashtagId) => ({ hashtagId, rmheetId: postId })),
    skipDuplicates: true,
  });
  await tx.hashtag.updateMany({
    where: { id: { in: fresh } },
    data: { postCount: { increment: 1 } },
  });
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
  // `@@unique([hashtagId, rmheetId])` means a post links each tag at most once,
  // so every affected tag decrements by exactly 1 — one statement, not one per tag.
  await tx.hashtag.updateMany({
    where: { id: { in: links.map((l) => l.hashtagId) } },
    data: { postCount: { decrement: 1 } },
  });
}

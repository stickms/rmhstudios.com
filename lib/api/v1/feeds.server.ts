/**
 * `/api/v1/me/feeds*`, `/api/v1/feeds/{id}/posts` (s09-08): the key owner's feeds and lists, a feed's posts as the
 * site pages them, and the one list write a script needs (replace the members).
 *
 * Reads go through the site's own reader: `readFeedPage` applies the viewer's blocks, mutes and the shared visibility
 * predicate, and the posts come back through the v1 serialiser (`serializePublicPost`), so quiet counts, content
 * warnings and GIF descriptions apply as on `GET /api/v1/feed` (`countsHiddenFrom` runs inside the serialiser, with
 * the key owner as viewer). Visibility is `readableByOthers` (which reads both
 * `isPublic` and `visibility`), never one field: another member's private feed is a 404, not a 403. A search or an
 * alert is a query, not a timeline (`not_a_timeline`). Quiz polls are never returned here (the serialiser carries no
 * poll). The members write is stricter than the site's `addMember`: handles that resolve to nobody, to a deleted or
 * banned account, or to a member blocked in either direction are skipped and reported, never added.
 */
import { prisma } from '@/lib/prisma.server';
import { feedSourceSelect, readFeedPage, readableByOthers, toFeedSource } from '@/lib/feeds/feeds.server';
import { ListError, replaceListMembers } from '@/lib/lists/lists.server';
import { MAX_MEMBERS } from '@/lib/lists/constants';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { isDeletedAccount } from '@/lib/account-lifecycle';
import { userDisplaySelect } from '@/lib/user-display';
import { serializePublicPost } from '@/lib/api/serializers.server';
import { TIMELINE_KINDS, decodeFeedsCursor, encodeFeedsCursor } from '@/lib/api/v1/feeds-schema';

const feedRowSelect = {
  id: true,
  ownerId: true,
  kind: true,
  name: true,
  description: true,
  visibility: true,
  isPublic: true,
  pinned: true,
  tags: true,
  keywords: true,
  query: true,
  types: true,
  notify: true,
  subscriberCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface FeedRow {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  visibility: string;
  pinned: boolean;
  tags: string[];
  keywords: string[];
  query: string | null;
  types: string[];
  notify: boolean;
  subscriberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeFeed(r: FeedRow) {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    visibility: String(r.visibility),
    pinned: r.pinned,
    tags: r.tags ?? [],
    keywords: r.keywords ?? [],
    query: r.query,
    types: r.types ?? [],
    notify: r.notify,
    subscribers: r.subscriberCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** A member the key owner must not add or see posts from: banned now, deleted, or with a deletion scheduled. */
function isHiddenAccount(u: {
  id?: string;
  banReason?: string | null;
  bannedUntil?: Date | null;
  deletionScheduledAt?: Date | null;
}): boolean {
  return (
    isDeletedAccount(u) ||
    u.deletionScheduledAt != null ||
    (u.bannedUntil != null && u.bannedUntil.getTime() > Date.now())
  );
}

/** The key owner's feeds of every kind, newest first (`?kind=` narrows), keyset by `createdAt|id`. */
export async function listMyFeeds(
  userId: string,
  opts: { limit: number; cursor?: string | undefined; kind?: string | undefined },
) {
  const cur = opts.cursor ? decodeFeedsCursor(opts.cursor) : null;
  if (opts.cursor && !cur) return 'invalid_cursor' as const;
  const rows = await prisma.customFeed.findMany({
    where: {
      ownerId: userId,
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(cur ? { OR: [{ createdAt: { lt: cur.at } }, { createdAt: cur.at, id: { lt: cur.id } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: opts.limit + 1,
    select: feedRowSelect,
  });
  const pageRows = rows.slice(0, opts.limit);
  const last = pageRows[pageRows.length - 1];
  return {
    data: pageRows.map(serializeFeed),
    nextCursor: rows.length > opts.limit && last ? encodeFeedsCursor({ at: last.createdAt, id: last.id }) : null,
  };
}

/** One of the key owner's feeds with its people's handles, or null (missing or not theirs: another member's is a 404). */
export async function getMyFeed(userId: string, id: string) {
  const row = await prisma.customFeed.findFirst({ where: { id, ownerId: userId }, select: feedRowSelect });
  if (!row) return null;
  let members: string[] = [];
  if (row.kind === 'list' || row.kind === 'feed') {
    const rows = await prisma.customFeedMember.findMany({
      where: { feedId: id },
      orderBy: { addedAt: 'desc' },
      take: MAX_MEMBERS,
      select: { user: { select: { handle: true } } },
    });
    members = rows.map((m) => m.user.handle).filter((h): h is string => !!h);
  }
  return { ...serializeFeed(row), members };
}

export type FeedPostsResult =
  | { ok: true; data: ReturnType<typeof serializePublicPost>[]; nextCursor: string | null }
  | { ok: false; reason: 'not_found' | 'not_a_timeline' | 'invalid_cursor' };

/** A page of a feed's posts as the site shows them to the key owner. */
export async function getFeedPostsForKey(
  userId: string,
  id: string,
  opts: { limit: number; cursor?: string | undefined },
): Promise<FeedPostsResult> {
  const row = await prisma.customFeed.findUnique({
    where: { id },
    select: { ...feedSourceSelect, ownerId: true, isPublic: true, visibility: true },
  });
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.ownerId !== userId) {
    if (!readableByOthers(row)) return { ok: false, reason: 'not_found' };
    // A feed of a member who blocked the key owner (or whom they blocked) is not theirs to read.
    if ((await getBlockedAuthorIds(userId)).includes(row.ownerId)) return { ok: false, reason: 'not_found' };
  }
  if (!TIMELINE_KINDS.includes(row.kind)) return { ok: false, reason: 'not_a_timeline' };
  if (opts.cursor && !decodeFeedsCursor(opts.cursor)) return { ok: false, reason: 'invalid_cursor' };

  const { page, nextCursor } = await readFeedPage(toFeedSource(row), userId, {
    cursor: opts.cursor,
    pageSize: opts.limit,
  });
  if (!page.length) return { ok: true, data: [], nextCursor: null };
  const posts = await prisma.rMHark.findMany({
    where: { id: { in: page.map((p) => p.id) }, deletedAt: null },
    select: {
      id: true,
      content: true,
      createdAt: true,
      likeCount: true,
      commentCount: true,
      repostCount: true,
      viewCount: true,
      imageUrls: true,
      imageAlts: true,
      gifUrl: true,
      gifAlt: true,
      isSensitive: true,
      contentWarning: true,
      pinnedCommentId: true,
      user: { select: { ...userDisplaySelect, banReason: true, bannedUntil: true, deletionScheduledAt: true } },
    },
  });
  const byId = new Map(posts.map((p) => [p.id, p]));
  const data = page
    .map((p) => byId.get(p.id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .filter((p) => !isHiddenAccount(p.user))
    .map((p) => serializePublicPost(p, userId));
  return { ok: true, data, nextCursor };
}

export type ReplaceMembersResult =
  | {
      ok: true;
      members: string[];
      skipped: { handle: string; reason: 'not_found' | 'blocked' }[];
    }
  | { ok: false; reason: 'not_found' | 'too_many' };

/** Replace a list's members by handle. Case-insensitive; duplicates collapse; unusable handles are reported. */
export async function replaceMembersForKey(
  userId: string,
  listId: string,
  rawHandles: string[],
): Promise<ReplaceMembersResult> {
  const own = await prisma.customFeed.findFirst({
    where: { id: listId, ownerId: userId, kind: 'list' },
    select: { id: true },
  });
  if (!own) return { ok: false, reason: 'not_found' };

  const seen = new Set<string>();
  const handles: string[] = [];
  for (const raw of rawHandles) {
    const h = raw.trim().replace(/^@/, '');
    if (!h || seen.has(h.toLowerCase())) continue;
    seen.add(h.toLowerCase());
    handles.push(h);
  }
  if (handles.length > MAX_MEMBERS) return { ok: false, reason: 'too_many' };

  const [users, blocked] = await Promise.all([
    handles.length
      ? prisma.user.findMany({
          where: { handle: { in: handles, mode: 'insensitive' } },
          select: { id: true, handle: true, banReason: true, bannedUntil: true, deletionScheduledAt: true },
        })
      : Promise.resolve([]),
    getBlockedAuthorIds(userId),
  ]);
  const blockedSet = new Set(blocked);
  const byHandle = new Map(users.filter((u) => u.handle).map((u) => [(u.handle as string).toLowerCase(), u]));

  const ids: string[] = [];
  const members: string[] = [];
  const skipped: { handle: string; reason: 'not_found' | 'blocked' }[] = [];
  for (const h of handles) {
    const u = byHandle.get(h.toLowerCase());
    if (!u || isHiddenAccount(u)) skipped.push({ handle: h, reason: 'not_found' });
    else if (blockedSet.has(u.id)) skipped.push({ handle: h, reason: 'blocked' });
    else {
      ids.push(u.id);
      members.push(u.handle as string);
    }
  }
  try {
    await replaceListMembers(userId, listId, ids);
  } catch (e) {
    if (e instanceof ListError) return { ok: false, reason: e.message === 'MEMBER_LIMIT' ? 'too_many' : 'not_found' };
    throw e;
  }
  return { ok: true, members, skipped };
}

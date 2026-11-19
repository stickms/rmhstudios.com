/**
 * Feeds — the one reader for every "show me these people, tags or terms" row
 * (`CustomFeed`, kinds in `./kinds`). `/feeds/$id` (FeedItem cards) and
 * `/lists/$id` (the lightweight list timeline) both page through
 * `readFeedPage`, so a list and a custom feed obey the same visibility,
 * block/mute and paging rules.
 *
 * Each source is read through an existing index (the people through
 * rmheet(userId, createdAt), tags through post_hashtag, keywords and alert
 * terms inside a 14-day window), merged on the same (createdAt, id) keyset,
 * and only then hydrated by the caller — so paging is exact for people, tags
 * and keywords, and no source scans the posts table.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { viewerVisiblePostWhere } from '@/lib/feed/audience.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { alertAnchor, compileAlert, matches } from '@/lib/search/keyword-alerts';

const KEYWORD_WINDOW_MS = 14 * 86_400_000;
/** An alert is matched in JS after an anchor prefilter; this bounds that scan per page. */
const ALERT_SCAN = 5;

/** What the reader needs of a feed row. */
export interface FeedSource {
  id: string;
  tags: string[];
  keywords: string[];
  /** A keyword alert's query (`lib/search/keyword-alerts.ts` syntax); null for other kinds. */
  alertQuery: string | null;
}

export const feedSourceSelect = {
  id: true,
  kind: true,
  tags: true,
  keywords: true,
  query: true,
} as const;

export function toFeedSource(row: {
  id: string;
  kind: string;
  tags: string[] | null;
  keywords: string[] | null;
  query: string | null;
}): FeedSource {
  return {
    id: row.id,
    tags: row.tags ?? [],
    keywords: row.keywords ?? [],
    alertQuery: row.kind === 'alert' ? row.query : null,
  };
}

/** Readable by someone other than the owner: published, or shared by link. */
export function readableByOthers(row: { isPublic: boolean; visibility: string }): boolean {
  return row.isPublic || row.visibility !== 'PRIVATE';
}

export async function feedMemberIds(feedId: string): Promise<string[]> {
  const rows = await prisma.customFeedMember.findMany({
    where: { feedId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

function parseCursor(cursor?: string): { at: Date; id: string } | null {
  const [iso, id] = (cursor ?? '').split('|');
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime()) && id ? { at, id } : null;
}

interface Hit {
  id: string;
  createdAt: Date;
}

/**
 * One keyset page of a feed's post ids, newest first. The caller hydrates them
 * in whatever shape its surface renders.
 */
export async function readFeedPage(
  src: FeedSource,
  viewerId: string | null,
  opts: { cursor?: string | undefined; pageSize: number },
): Promise<{ page: Hit[]; nextCursor: string | null }> {
  const memberIds = await feedMemberIds(src.id);
  const empty = { page: [], nextCursor: null };
  if (!memberIds.length && !src.tags.length && !src.keywords.length && !src.alertQuery) {
    return empty;
  }

  // A feed is a timeline: authors the viewer blocked or muted (or who blocked
  // them) do not appear in it, even when the feed names them. The shared
  // visibility predicate carries the audience / deleted / block rule and is
  // nested under AND because it owns the `userId` key too.
  const [visible, hidden] = await Promise.all([
    viewerVisiblePostWhere(viewerId, { hideMuted: true }),
    getHiddenAuthorIds(viewerId),
  ]);
  const people = hidden.length ? memberIds.filter((id) => !hidden.includes(id)) : memberIds;

  const cur = parseCursor(opts.cursor);
  const and: Prisma.RMHarkWhereInput[] = [
    visible as Prisma.RMHarkWhereInput,
    ...(cur
      ? [{ OR: [{ createdAt: { lt: cur.at } }, { createdAt: cur.at, id: { lt: cur.id } }] }]
      : []),
  ];
  const top = { threadRootId: null, communityId: null } as const;
  const recent = { createdAt: { gte: new Date(Date.now() - KEYWORD_WINDOW_MS) } };
  const sel = { id: true, createdAt: true } as const;
  const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  const take = opts.pageSize + 1;

  const reads: Promise<Hit[]>[] = [];
  if (people.length) {
    reads.push(
      prisma.rMHark.findMany({
        where: { userId: { in: people }, ...top, AND: and },
        orderBy: order,
        take,
        select: sel,
      }),
    );
  }
  if (src.tags.length) {
    reads.push(
      prisma.rMHark.findMany({
        where: { ...top, hashtags: { some: { hashtag: { tag: { in: src.tags } } } }, AND: and },
        orderBy: order,
        take,
        select: sel,
      }),
    );
  }
  if (src.keywords.length) {
    reads.push(
      prisma.rMHark.findMany({
        where: {
          ...top,
          AND: [
            ...and,
            recent,
            {
              OR: src.keywords.map((k) => ({
                content: { contains: k, mode: 'insensitive' as const },
              })),
            },
          ],
        },
        orderBy: order,
        take,
        select: sel,
      }),
    );
  }
  const compiled = src.alertQuery ? compileAlert(src.alertQuery) : null;
  if (compiled) {
    // The anchor is a word every match contains, so it prefilters in SQL; the
    // exact whole-word / phrase / exclude rule is the alert's own matcher.
    const first = alertAnchor(compiled.source);
    reads.push(
      prisma.rMHark
        .findMany({
          where: {
            ...top,
            AND: [
              ...and,
              recent,
              ...(first ? [{ content: { contains: first, mode: 'insensitive' as const } }] : []),
            ],
          },
          orderBy: order,
          take: take * ALERT_SCAN,
          select: { ...sel, content: true },
        })
        .then((rows) =>
          rows
            .filter((r) => matches(compiled, r.content))
            .map((r) => ({ id: r.id, createdAt: r.createdAt })),
        ),
    );
  }
  if (!reads.length) return empty;

  const merged = new Map<string, Hit>();
  for (const r of (await Promise.all(reads)).flat()) merged.set(r.id, r);
  const ordered = [...merged.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
  );
  const page = ordered.slice(0, opts.pageSize);
  const last = page[page.length - 1];
  return {
    page,
    nextCursor:
      ordered.length > opts.pageSize && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

/** Replace a feed's people. */
export async function setFeedPeople(feedId: string, userIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.customFeedMember.deleteMany({ where: { feedId, userId: { notIn: userIds } } }),
    prisma.customFeedMember.createMany({
      data: userIds.map((userId) => ({ feedId, userId })),
      skipDuplicates: true,
    }),
  ]);
}

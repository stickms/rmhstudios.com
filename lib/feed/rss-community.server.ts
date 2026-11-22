/**
 * `/c/{slug}/rss.xml` — the newest posts of a PUBLIC community, as RSS 2.0.
 *
 * A feed has no viewer, so this is exactly what a signed-out visitor reads on `/c/{slug}` and a little less. Starting
 * from the strict public predicate the other feeds share (`PUBLIC_POST_WHERE`), a post is left out when it is:
 *   - held by AutoMod or removed (both are `deletedAt`; a held post is a removal until a moderator approves it),
 *   - behind a price (`unlockPrice` is in the shared predicate),
 *   - not audience PUBLIC (in the shared predicate),
 *   - by a member banned from the site (`bannedUntil` in the future), banned from this community (an active ban, not a
 *     timeout), or whose account is in its deletion grace period (`deletionScheduledAt`).
 * A private community is not served at all: the caller answers 404, the same as a slug that does not exist, so a
 * subscription never confirms that a private community is there.
 *
 * A post with a content warning reason carries the warning as its title and description and none of its text. A post
 * with a quiz poll shows the question and the option texts; the poll's stored answer is never selected. No GIF or
 * image is put in an item (no media column is selected), so there is nothing to describe or to cover.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import type { RssItem } from '@/lib/rss';
import { contentWarningOrNull } from '@/lib/feed/content-warning';
import { PUBLIC_POST_WHERE, summarize, warningNotice } from '@/lib/feed/rss.server';

/** Items in a community feed. */
export const COMMUNITY_FEED_LIMIT = 30;

/** Community slugs are lower-case words and dashes; anything else is a 404 before the database is asked. */
export const COMMUNITY_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * The `where` of the feed: the shared strict public predicate, moved into this community, minus members who are
 * banned (site or community) or leaving. Pure, so a test can read it.
 */
export function communityFeedWhere(communityId: string, now: Date): Prisma.RMHarkWhereInput {
  const { communityId: _outsideCommunities, ...strict } = PUBLIC_POST_WHERE;
  void _outsideCommunities;
  return {
    ...strict,
    communityId,
    user: {
      deletionScheduledAt: null,
      OR: [{ bannedUntil: null }, { bannedUntil: { lte: now } }],
      communityBansAbout: {
        none: {
          communityId,
          kind: 'ban',
          liftedAt: null,
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
      },
    },
  };
}

const POST_SELECT = {
  id: true,
  content: true,
  contentWarning: true,
  createdAt: true,
  audience: true,
  deletedAt: true,
  unlockPrice: true,
  user: { select: { bannedUntil: true, deletionScheduledAt: true } },
  poll: { select: { question: true, options: { orderBy: { position: 'asc' }, select: { text: true } } } },
} as const satisfies Prisma.RMHarkSelect;

type FeedRow = Prisma.RMHarkGetPayload<{ select: typeof POST_SELECT }>;

/**
 * The query already excludes these; the same rules run again on the rows it returned so a change to the query can
 * never put one of them in a feed (defence in depth, and the test's fixture goes through it).
 */
export function isFeedPost(row: FeedRow, now: Date): boolean {
  if (row.deletedAt) return false;
  if (row.audience !== 'PUBLIC') return false;
  if (row.unlockPrice && row.unlockPrice > 0) return false;
  if (row.user.deletionScheduledAt) return false;
  if (row.user.bannedUntil && row.user.bannedUntil.getTime() > now.getTime()) return false;
  return true;
}

async function toItem(row: FeedRow): Promise<RssItem> {
  const link = `${SITE_URL}/thread/${row.id}`;
  const reason = contentWarningOrNull(row.contentWarning);
  if (reason) {
    const notice = await warningNotice(reason);
    return { title: summarize(notice, 100), link, guid: link, description: notice, pubDate: row.createdAt };
  }
  let description = summarize(row.content);
  if (row.poll) {
    const options = row.poll.options.map((o) => `- ${o.text}`).join('\n');
    description = `${description}\n\nPoll: ${row.poll.question}\n${options}`.trim();
  }
  return {
    title: summarize(row.content, 100) || (row.poll ? summarize(row.poll.question, 100) : 'Post'),
    link,
    guid: link,
    description,
    pubDate: row.createdAt,
  };
}

export interface CommunityFeed {
  title: string;
  link: string;
  description: string;
  items: RssItem[];
}

/** The feed of a public community, or null for a missing or private one (the route answers 404 for both). */
export async function communityFeed(slug: string, now: Date = new Date()): Promise<CommunityFeed | null> {
  const community = await prisma.community.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, description: true, isPrivate: true },
  });
  if (!community || community.isPrivate) return null;

  const rows = await prisma.rMHark.findMany({
    where: communityFeedWhere(community.id, now),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: COMMUNITY_FEED_LIMIT,
    select: POST_SELECT,
  });
  const items = await Promise.all(
    rows
      .filter((r) => isFeedPost(r, now))
      .slice(0, COMMUNITY_FEED_LIMIT)
      .map(toItem),
  );
  return {
    title: `${community.name} — RMH Studios`,
    link: `${SITE_URL}/c/${community.slug}`,
    description: community.description?.trim() || `Posts in the ${community.name} community on RMH Studios.`,
    items,
  };
}

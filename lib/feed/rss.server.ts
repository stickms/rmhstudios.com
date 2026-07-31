/**
 * Public post feeds — the shared query behind `/tag/{tag}/rss.xml` and
 * `/u/{handle}/rss.xml`.
 *
 * Syndication existed only for the blog and news, so the platform's largest
 * body of content (posts) had no subscribe path at all: following a hashtag or
 * a person required an account and a visit. These feeds are the cheapest
 * distribution the site can offer, and they cost nothing to maintain.
 *
 * The visibility rule lives here, once, deliberately. A feed is served to
 * anonymous readers and cached by aggregators, so ANY leak is permanent and
 * public. Getting the predicate right in one place and reusing it is the only
 * safe way to add a second feed:
 *
 *   - `audience: PUBLIC` only. Followers-only, circle, supporter and private
 *     posts are excluded — a feed has no viewer to check a relationship against.
 *   - Not deleted.
 *   - No paid unlock. A gated post's teaser is not the post; syndicating it
 *     would give away the thing somebody paid for.
 *   - No community posts. Community visibility depends on membership, which
 *     again there is no viewer to evaluate.
 */

import { prisma } from '@/lib/prisma.server';
import type { Prisma } from '@prisma/client';
import { SITE_URL } from '@/lib/seo';
import type { RssItem } from '@/lib/rss';

/** Most items any single feed will emit. */
export const FEED_LIMIT = 40;

/**
 * The visibility predicate every public feed must use. Exported so a test can
 * assert the feeds share it rather than each hand-rolling a subset.
 */
export const PUBLIC_POST_WHERE: Prisma.RMHarkWhereInput = {
  audience: 'PUBLIC',
  deletedAt: null,
  communityId: null,
  OR: [{ unlockPrice: null }, { unlockPrice: 0 }],
};

/** Collapse a post body into a one-line plain-text summary. */
function summarize(content: string, max = 400): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

interface FeedPost {
  id: string;
  content: string;
  createdAt: Date;
  user: { handle: string | null; name: string | null };
}

function toItems(posts: FeedPost[]): RssItem[] {
  return posts.map((p) => {
    const link = `${SITE_URL}/thread/${p.id}`;
    return {
      title: summarize(p.content, 100) || 'Post',
      link,
      guid: link,
      description: summarize(p.content),
      pubDate: p.createdAt,
    };
  });
}

const POST_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  user: { select: { handle: true, name: true } },
} as const;

/** Public posts carrying `tag` (without the leading '#'), newest first. */
export async function tagFeedItems(tag: string): Promise<RssItem[]> {
  const posts = await prisma.rMHark.findMany({
    where: {
      ...PUBLIC_POST_WHERE,
      hashtags: { some: { hashtag: { tag: tag.toLowerCase() } } },
    },
    orderBy: { createdAt: 'desc' },
    take: FEED_LIMIT,
    select: POST_SELECT,
  });
  return toItems(posts);
}

/**
 * Public posts by `handle`, newest first. Returns null when the handle doesn't
 * exist, so the route can 404 rather than serve an empty feed that looks like a
 * real but silent account.
 */
export async function userFeedItems(
  handle: string,
): Promise<{ displayName: string; items: RssItem[] } | null> {
  const user = await prisma.user.findFirst({
    where: { handle },
    select: { id: true, name: true, handle: true },
  });
  if (!user) return null;

  const posts = await prisma.rMHark.findMany({
    where: { ...PUBLIC_POST_WHERE, userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: FEED_LIMIT,
    select: POST_SELECT,
  });

  return {
    displayName: user.name ?? user.handle ?? 'RMH Studios user',
    items: toItems(posts),
  };
}

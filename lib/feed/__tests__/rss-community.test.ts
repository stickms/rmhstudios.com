import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    community: { findUnique: vi.fn() },
    rMHark: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma.server';
import { renderRssFeed } from '@/lib/rss';
import {
  COMMUNITY_FEED_LIMIT,
  COMMUNITY_SLUG_PATTERN,
  communityFeed,
  communityFeedWhere,
} from '@/lib/feed/rss-community.server';

const findCommunity = vi.mocked(prisma.community.findUnique);
const findPosts = vi.mocked(prisma.rMHark.findMany);

const NOW = new Date('2026-11-22T12:00:00Z');
const FUTURE = new Date('2027-01-01T00:00:00Z');
const day = (n: number) => new Date(Date.UTC(2026, 10, n));

interface Fixture {
  id: string;
  content: string;
  contentWarning: string | null;
  createdAt: Date;
  audience: 'PUBLIC' | 'FOLLOWERS';
  deletedAt: Date | null;
  unlockPrice: number | null;
  user: { bannedUntil: Date | null; deletionScheduledAt: Date | null };
  poll: { question: string; options: { text: string }[] } | null;
}

const post = (id: string, n: number, over: Partial<Fixture> = {}): Fixture => ({
  id,
  content: `body of ${id}`,
  contentWarning: null,
  createdAt: day(n),
  audience: 'PUBLIC',
  deletedAt: null,
  unlockPrice: null,
  user: { bannedUntil: null, deletionScheduledAt: null },
  poll: null,
  ...over,
});

/** One fixture, newest first: what both the page and the feed are built from. */
const FIXTURE: Fixture[] = [
  post('p-ok-1', 20),
  post('p-held', 19, { deletedAt: day(19) }),
  post('p-banned', 18, { user: { bannedUntil: FUTURE, deletionScheduledAt: null } }),
  post('p-ok-2', 17),
  post('p-grace', 16, { user: { bannedUntil: null, deletionScheduledAt: day(16) } }),
  post('p-locked', 15, { unlockPrice: 50 }),
  post('p-followers', 14, { audience: 'FOLLOWERS' }),
  post('p-ok-3', 13, { user: { bannedUntil: day(1), deletionScheduledAt: null } }),
];

/** What `/c/$slug` shows a signed-out visitor: not removed, public audience (viewerVisiblePostWhere(null)). */
const pageIds = (rows: Fixture[]) => rows.filter((r) => !r.deletedAt && r.audience === 'PUBLIC').map((r) => r.id);

const ids = (items: { guid: string }[]) => items.map((i) => i.guid.replace(/^.*\/thread\//, ''));

beforeEach(() => {
  vi.clearAllMocks();
  findCommunity.mockResolvedValue({
    id: 'c1',
    slug: 'retro',
    name: 'Retro <Hardware> & "Co"',
    description: null,
    isPrivate: false,
  } as never);
  findPosts.mockResolvedValue(FIXTURE as never);
});

describe('community feed visibility', () => {
  it('is null for a private community and never reads its posts', async () => {
    findCommunity.mockResolvedValue({
      id: 'c2',
      slug: 'secret',
      name: 'S',
      description: null,
      isPrivate: true,
    } as never);
    expect(await communityFeed('secret', NOW)).toBeNull();
    expect(findPosts).not.toHaveBeenCalled();
  });

  it('is null for an unknown community', async () => {
    findCommunity.mockResolvedValue(null);
    expect(await communityFeed('nope', NOW)).toBeNull();
  });

  it('leaves out held, removed, banned, leaving, locked and non-public posts', async () => {
    const feed = await communityFeed('retro', NOW);
    expect(ids(feed!.items)).toEqual(['p-ok-1', 'p-ok-2', 'p-ok-3']);
  });

  it('lists only what the page lists, in the page order', async () => {
    const feed = await communityFeed('retro', NOW);
    const page = pageIds(FIXTURE);
    const feedIds = ids(feed!.items);
    expect(feedIds.every((id) => page.includes(id))).toBe(true);
    expect(feedIds).toEqual(page.filter((id) => feedIds.includes(id)));
  });

  it('asks the database for the strict predicate, in this community', () => {
    const where = communityFeedWhere('c1', NOW) as Record<string, unknown>;
    expect(where.communityId).toBe('c1');
    expect(where.audience).toBe('PUBLIC');
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toEqual([{ unlockPrice: null }, { unlockPrice: 0 }]);
    const user = where.user as Record<string, unknown>;
    expect(user.deletionScheduledAt).toBeNull();
    expect(user.OR).toEqual([{ bannedUntil: null }, { bannedUntil: { lte: NOW } }]);
    expect(user.communityBansAbout).toEqual({
      none: {
        communityId: 'c1',
        kind: 'ban',
        liftedAt: null,
        OR: [{ endsAt: null }, { endsAt: { gt: NOW } }],
      },
    });
    expect(findPosts).not.toHaveBeenCalled();
  });

  it('takes at most thirty, newest first', async () => {
    await communityFeed('retro', NOW);
    const args = findPosts.mock.calls[0]![0]!;
    expect(args.take).toBe(COMMUNITY_FEED_LIMIT);
    expect(COMMUNITY_FEED_LIMIT).toBe(30);
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('never selects media or the stored quiz answer', async () => {
    await communityFeed('retro', NOW);
    const select = JSON.stringify(findPosts.mock.calls[0]![0]!.select);
    for (const field of ['gifUrl', 'gifAlt', 'imageUrls', 'correctOptionId', 'explanation']) {
      expect(select).not.toContain(field);
    }
  });
});

describe('community feed content', () => {
  it('replaces a warned post with its warning and none of its text', async () => {
    findPosts.mockResolvedValue([
      post('p-cw', 20, { content: 'secret spoiler text', contentWarning: 'Spoilers' }),
    ] as never);
    const [item] = (await communityFeed('retro', NOW))!.items;
    expect(item!.title).toContain('Spoilers');
    expect(item!.description).toContain('Spoilers');
    expect(JSON.stringify(item)).not.toContain('secret spoiler');
  });

  it('shows a quiz poll as a question and options', async () => {
    findPosts.mockResolvedValue([
      post('p-quiz', 20, {
        content: 'Quiz time',
        poll: { question: 'Capital of France?', options: [{ text: 'Paris' }, { text: 'Rome' }] },
      }),
    ] as never);
    const [item] = (await communityFeed('retro', NOW))!.items;
    expect(item!.description).toContain('Capital of France?');
    expect(item!.description).toContain('- Paris');
    expect(item!.description).toContain('- Rome');
  });

  it('escapes every piece of XML', async () => {
    findPosts.mockResolvedValue([
      post('p-x', 20, {
        content: 'a <b>&</b> "q" ]]> end',
        poll: { question: 'x ]]> <y>', options: [{ text: '<o>' }] },
      }),
    ] as never);
    const feed = (await communityFeed('retro', NOW))!;
    const xml = renderRssFeed({ ...feed, feedUrl: 'https://example.test/c/retro/rss.xml' });
    expect(xml).toContain('<title>Retro &lt;Hardware&gt; &amp; &quot;Co&quot; — RMH Studios</title>');
    expect(xml).not.toMatch(/<title>[^<]*<b>/);
    // The description sits in CDATA, and a nested end marker is split so it cannot close the section early.
    expect(xml).toContain(']]]]><![CDATA[>');
    expect(xml.match(/<!\[CDATA\[/g)!.length).toBeGreaterThan(1);
  });

  it('links items to the absolute thread URL', async () => {
    const feed = (await communityFeed('retro', NOW))!;
    expect(feed.items[0]!.link).toMatch(/^https?:\/\/.+\/thread\/p-ok-1$/);
    expect(feed.link).toMatch(/\/c\/retro$/);
  });
});

describe('slug validation', () => {
  it('accepts slugs and rejects everything else', () => {
    expect(COMMUNITY_SLUG_PATTERN.test('retro-hardware')).toBe(true);
    for (const bad of ['', '../x', 'a b', 'a/b', '-a', 'x'.repeat(65), 'a<b']) {
      expect(COMMUNITY_SLUG_PATTERN.test(bad), bad).toBe(false);
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({
  prisma: { gamePatchNote: { findMany: vi.fn() } },
}));

import { prisma } from '@/lib/prisma.server';
import { games } from '@/lib/catalog';
import { isOffSite } from '@/lib/games/library';
import { renderRssFeed } from '@/lib/rss';
import { GAME_ID_PATTERN, UPDATES_FEED_LIMIT, updatesFeed } from '@/lib/arcade/updates-rss.server';

const findNotes = vi.mocked(prisma.gamePatchNote.findMany);
const game = games.find((g) => !isOffSite(g.href))!;

beforeEach(() => {
  vi.clearAllMocks();
  findNotes.mockResolvedValue([
    {
      id: 'n2',
      gameId: game.id,
      version: '1.2',
      title: 'Fixes <all> & more',
      body: 'Body ]]> text',
      createdAt: new Date('2026-11-10'),
    },
    { id: 'n1', gameId: game.id, version: '1.1', title: 'Launch', body: 'First.', createdAt: new Date('2026-11-01') },
  ] as never);
});

describe('game updates feed', () => {
  it('is null for an id that is not in the catalogue, without a query', async () => {
    expect(await updatesFeed('no-such-game-id')).toBeNull();
    expect(findNotes).not.toHaveBeenCalled();
  });

  it('reads the newest thirty notes of the game, newest first', async () => {
    await updatesFeed(game.id);
    const args = findNotes.mock.calls[0]![0]!;
    expect(args.take).toBe(UPDATES_FEED_LIMIT);
    expect(UPDATES_FEED_LIMIT).toBe(30);
    expect(args.where).toEqual({ gameId: game.id });
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('turns each note into an item linked to the updates page', async () => {
    const feed = (await updatesFeed(game.id))!;
    expect(feed.items.map((i) => i.title)).toEqual(['1.2: Fixes <all> & more', '1.1: Launch']);
    expect(feed.items[0]!.link).toMatch(new RegExp(`/games/${game.id}/updates$`));
    expect(new Set(feed.items.map((i) => i.guid)).size).toBe(2);
    expect(feed.items[0]!.pubDate).toEqual(new Date('2026-11-10'));
  });

  it('escapes titles and defuses a CDATA end marker in a body', async () => {
    const feed = (await updatesFeed(game.id))!;
    const xml = renderRssFeed({ ...feed, feedUrl: 'https://example.test/x/rss.xml' });
    expect(xml).toContain('<title>1.2: Fixes &lt;all&gt; &amp; more</title>');
    expect(xml).toContain(']]]]><![CDATA[>');
  });

  it('rejects odd game ids', () => {
    expect(GAME_ID_PATTERN.test(game.id)).toBe(true);
    for (const bad of ['', '../x', 'a b', '-a']) expect(GAME_ID_PATTERN.test(bad), bad).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userBuild: { findUnique: vi.fn() },
    buildVersion: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma.server';
import { renderRssFeed } from '@/lib/rss';
import { BUILD_FEED_LIMIT, BUILD_SLUG_PATTERN, buildFeed, notesToText } from '@/lib/builds/rss.server';

const findBuild = vi.mocked(prisma.userBuild.findUnique);
const findVersions = vi.mocked(prisma.buildVersion.findMany);

const NOW = new Date('2026-11-22T12:00:00Z');

const build = (over: Record<string, unknown> = {}) =>
  ({
    id: 'b1',
    slug: 'tiny-tool',
    title: 'Tiny <Tool>',
    description: 'd',
    visibility: 'PUBLIC',
    publishedAt: new Date('2026-11-01T00:00:00Z'),
    user: { bannedUntil: null, deletionScheduledAt: null },
    ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  findBuild.mockResolvedValue(build());
  findVersions.mockResolvedValue([
    {
      id: 'v2',
      version: '1.1.0',
      changelog: '## New\n**Faster** [docs](https://x.test) & more',
      createdAt: new Date('2026-11-10T00:00:00Z'),
    },
    { id: 'v1', version: '1.0.0', changelog: null, createdAt: new Date('2026-11-02T00:00:00Z') },
  ] as never);
});

describe('build feed visibility', () => {
  it.each([['UNLISTED'], ['PRIVATE']])('is null for a %s build and reads no releases', async (visibility) => {
    findBuild.mockResolvedValue(build({ visibility }));
    expect(await buildFeed('tiny-tool', NOW)).toBeNull();
    expect(findVersions).not.toHaveBeenCalled();
  });

  it('is null for an unpublished draft', async () => {
    findBuild.mockResolvedValue(build({ publishedAt: null }));
    expect(await buildFeed('tiny-tool', NOW)).toBeNull();
  });

  it('is null for a missing build', async () => {
    findBuild.mockResolvedValue(null);
    expect(await buildFeed('nope', NOW)).toBeNull();
  });

  it('is null for a banned owner and for one leaving', async () => {
    findBuild.mockResolvedValue(build({ user: { bannedUntil: new Date('2027-01-01'), deletionScheduledAt: null } }));
    expect(await buildFeed('tiny-tool', NOW)).toBeNull();
    findBuild.mockResolvedValue(build({ user: { bannedUntil: null, deletionScheduledAt: new Date('2026-11-20') } }));
    expect(await buildFeed('tiny-tool', NOW)).toBeNull();
  });

  it('serves an owner whose ban has ended', async () => {
    findBuild.mockResolvedValue(build({ user: { bannedUntil: new Date('2026-01-01'), deletionScheduledAt: null } }));
    expect(await buildFeed('tiny-tool', NOW)).not.toBeNull();
  });

  it('looks a build up by slug only', async () => {
    await buildFeed('tiny-tool', NOW);
    expect(findBuild.mock.calls[0]![0]!.where).toEqual({ slug: 'tiny-tool' });
  });
});

describe('build feed items', () => {
  it('lists the newest thirty releases, newest first', async () => {
    await buildFeed('tiny-tool', NOW);
    const args = findVersions.mock.calls[0]![0]!;
    expect(args.take).toBe(BUILD_FEED_LIMIT);
    expect(BUILD_FEED_LIMIT).toBe(30);
    expect(args.where).toEqual({ buildId: 'b1' });
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('carries version, title, notes as text, date and the build page link', async () => {
    const feed = (await buildFeed('tiny-tool', NOW))!;
    const [first, second] = feed.items;
    expect(first!.title).toBe('Tiny <Tool> 1.1.0');
    expect(first!.description).toBe('New Faster docs & more');
    expect(first!.link).toMatch(/^https?:\/\/.+\/builds\/tiny-tool$/);
    expect(first!.pubDate).toEqual(new Date('2026-11-10T00:00:00Z'));
    expect(first!.guid).not.toBe(second!.guid);
    expect(second!.description).toContain('1.0.0 is out');
  });

  it('never selects or emits a repository, demo, download URL or commit', async () => {
    await buildFeed('tiny-tool', NOW);
    const selected = JSON.stringify([findBuild.mock.calls[0]![0]!.select, findVersions.mock.calls[0]![0]!.select]);
    for (const field of ['repoUrl', 'demoUrl', 'commitHash', 'readme']) expect(selected).not.toContain(field);
  });

  it('escapes the title and notes in the XML', async () => {
    findVersions.mockResolvedValue([
      { id: 'v1', version: '1.0', changelog: 'x ]]> <script>&</script>', createdAt: new Date('2026-11-02') },
    ] as never);
    const feed = (await buildFeed('tiny-tool', NOW))!;
    const xml = renderRssFeed({ ...feed, feedUrl: 'https://example.test/builds/tiny-tool/rss.xml' });
    expect(xml).toContain('<title>Tiny &lt;Tool&gt; releases — RMH Studios</title>');
    expect(xml).toContain('<title>Tiny &lt;Tool&gt; 1.0</title>');
    expect(xml).toContain(']]]]><![CDATA[>');
  });
});

describe('notesToText and slugs', () => {
  it('drops Markdown marks and keeps the words', () => {
    expect(notesToText('# Title\n![shot](a.png) see [here](https://x.test)')).toBe('Title shot see here');
    expect(notesToText(null)).toBe('');
  });

  it('rejects odd slugs', () => {
    expect(BUILD_SLUG_PATTERN.test('tiny-tool')).toBe(true);
    for (const bad of ['', '../x', 'a b', '-a', 'a?b']) expect(BUILD_SLUG_PATTERN.test(bad), bad).toBe(false);
  });
});

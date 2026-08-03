import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SITEMAP_CHUNK_SIZE } from '@/lib/sitemap';

/**
 * The section machinery, with Prisma stood in for.
 *
 * The behaviour worth pinning down here is what happens when the database is
 * *not* fine. `/sitemap.xml` is fetched by crawlers, not by users, so nobody
 * notices it failing — and a run of 5xx on a sitemap is read as a reason to
 * slow down crawling the whole site. So a section that can't reach Postgres has
 * to degrade to "absent" rather than take the index down with it.
 */

const prismaMock = {
  blogPost: { count: vi.fn(), findMany: vi.fn() },
  newsArticle: { count: vi.fn(), findMany: vi.fn() },
  libraryDocument: { count: vi.fn(), findMany: vi.fn() },
  album: { count: vi.fn(), findMany: vi.fn() },
  gameGuide: { count: vi.fn(), findMany: vi.fn() },
  userBuild: { count: vi.fn(), findMany: vi.fn() },
  vibePage: { count: vi.fn(), findMany: vi.fn() },
  user: { count: vi.fn(), findMany: vi.fn() },
  rMHark: { count: vi.fn(), findMany: vi.fn() },
  community: { count: vi.fn(), findMany: vi.fn() },
  aiPersona: { count: vi.fn(), findMany: vi.fn() },
  flashcardDeck: { count: vi.fn(), findMany: vi.fn() },
  tournament: { count: vi.fn(), findMany: vi.fn() },
  homeListing: { count: vi.fn(), findMany: vi.fn() },
  ladderJob: { count: vi.fn(), findMany: vi.fn() },
};

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

/** Every model answers 0 / [] unless a test says otherwise. */
function resetToEmpty() {
  for (const model of Object.values(prismaMock)) {
    model.count.mockReset().mockResolvedValue(0);
    model.findMany.mockReset().mockResolvedValue([]);
  }
}

beforeEach(resetToEmpty);
afterEach(() => vi.restoreAllMocks());

describe('the sitemap index survives a broken database', () => {
  it('omits a section whose count throws, and keeps the rest', async () => {
    const { listSitemapChunks } = await import('@/lib/sitemap.server');
    prismaMock.user.count.mockRejectedValue(new Error('connection refused'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const chunks = await listSitemapChunks();

    expect(chunks).not.toContain('/sitemaps/users.xml');
    // `pages` is static, so it is always there — which is the point: a DB
    // outage costs the DB-backed sections, not the sitemap.
    expect(chunks).toContain('/sitemaps/pages.xml');
    expect(errors).toHaveBeenCalled();
  });

  it('still lists a section that is merely empty', async () => {
    // Zero rows is not an error: the section exists and is legitimately empty,
    // and dropping it would tell a crawler the URLs were withdrawn.
    const { listSitemapChunks } = await import('@/lib/sitemap.server');
    const chunks = await listSitemapChunks();
    expect(chunks).toContain('/sitemaps/users.xml');
    expect(chunks).toContain('/sitemaps/posts.xml');
  });

  it('returns a byte-stable index across calls', async () => {
    // The index is cached for an hour; the fan-out is concurrent, so without
    // the sort the order would vary per request and defeat the cache.
    const { listSitemapChunks } = await import('@/lib/sitemap.server');
    prismaMock.user.count.mockResolvedValue(5);
    expect(await listSitemapChunks()).toEqual(await listSitemapChunks());
  });
});

describe('chunking', () => {
  it('splits a section into as many chunks as it needs', async () => {
    const { listSitemapChunks } = await import('@/lib/sitemap.server');
    prismaMock.user.count.mockResolvedValue(SITEMAP_CHUNK_SIZE * 2 + 1);
    const chunks = await listSitemapChunks();
    expect(chunks).toContain('/sitemaps/users.xml');
    expect(chunks).toContain('/sitemaps/users-2.xml');
    expect(chunks).toContain('/sitemaps/users-3.xml');
    expect(chunks).not.toContain('/sitemaps/users-4.xml');
  });

  it('warns rather than silently truncating when a section exceeds its cap', async () => {
    const { listSitemapChunks } = await import('@/lib/sitemap.server');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    prismaMock.user.count.mockResolvedValue(10_000_000);

    await listSitemapChunks();

    // A truncated sitemap is indistinguishable from a complete one, so the
    // shortfall has to say so somewhere.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('capped at'));
  });

  it('returns null for a section that does not exist', async () => {
    const { renderSection } = await import('@/lib/sitemap.server');
    expect(await renderSection('not-a-section', 1)).toBeNull();
  });

  it('returns empty past the end of a section rather than paging forever', async () => {
    const { renderSection } = await import('@/lib/sitemap.server');
    expect(await renderSection('users', 999)).toEqual([]);
  });
});

describe('visibility predicates', () => {
  it('asks only for users with a handle, posts, and no active ban', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    await SITEMAP_SECTIONS.users.page(0, 10);

    const where = prismaMock.user.findMany.mock.calls[0][0].where;
    expect(where.handle).toEqual({ not: null });
    expect(where.postCount).toEqual({ gt: 0 });
    expect(where.isBot).toBe(false);
    expect(where.OR).toEqual([{ bannedUntil: null }, { bannedUntil: { lt: expect.any(Date) } }]);
  });

  it('re-evaluates the ban cutoff per call', async () => {
    // A module-level `new Date()` would freeze this at process start, so a ban
    // that lapsed after boot would keep the profile out of the sitemap forever.
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await SITEMAP_SECTIONS.users.page(0, 10);
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    await SITEMAP_SECTIONS.users.page(0, 10);
    vi.useRealTimers();

    const first = prismaMock.user.findMany.mock.calls[0][0].where.OR[1].bannedUntil.lt;
    const second = prismaMock.user.findMany.mock.calls[1][0].where.OR[1].bannedUntil.lt;
    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });

  it('reuses the shared public-post predicate, and excludes reposts', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    const { PUBLIC_POST_WHERE } = await import('@/lib/feed/rss.server');
    await SITEMAP_SECTIONS.posts.page(0, 10);

    const where = prismaMock.rMHark.findMany.mock.calls[0][0].where;
    // The RSS feeds and the sitemap must agree on what "public" means; this is
    // the one place that rule is written down.
    for (const [key, value] of Object.entries(PUBLIC_POST_WHERE)) {
      expect(where[key]).toEqual(value);
    }
    expect(where.originalId).toBeNull();
    expect(where.user).toEqual({ handle: { not: null }, isBot: false });
  });

  it('builds post URLs from the author handle, not the post author id', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    prismaMock.rMHark.findMany.mockResolvedValue([
      { id: 'abc', updatedAt: new Date(0), user: { handle: 'someone' } },
    ]);
    const entries = await SITEMAP_SECTIONS.posts.page(0, 10);
    // The handle form is what the permalink canonicalises to.
    expect(entries[0].loc).toBe('/u/someone/post/abc');
  });

  it('lists only public communities, personas, decks and tournaments', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    await SITEMAP_SECTIONS.community.page(0, 10);

    expect(prismaMock.community.findMany.mock.calls[0][0].where).toEqual({ isPrivate: false });
    expect(prismaMock.aiPersona.findMany.mock.calls[0][0].where).toEqual({ isPublic: true });
    expect(prismaMock.flashcardDeck.findMany.mock.calls[0][0].where).toEqual({ isPublic: true });
    expect(prismaMock.tournament.findMany.mock.calls[0][0].where).toEqual({
      visibility: 'public',
    });
  });

  it('lists only PUBLIC builds and finished vibe pages', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    // The section skips the build query entirely when the count is 0, so give
    // it something to page through.
    prismaMock.userBuild.count.mockResolvedValue(3);
    await SITEMAP_SECTIONS.builds.page(0, 10);

    expect(prismaMock.userBuild.findMany.mock.calls[0][0].where).toEqual({ visibility: 'PUBLIC' });
    // A page still generating has no screenshot and no final copy — the route
    // marks those `noindex`, so listing them would contradict the page.
    expect(prismaMock.vibePage.findMany.mock.calls[0][0].where).toEqual({ status: 'ready' });
  });

  it('pages builds and vibe pages as one continuous run', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    prismaMock.userBuild.count.mockResolvedValue(20);
    prismaMock.userBuild.findMany.mockResolvedValue([
      { slug: 'a', updatedAt: new Date(0) },
      { slug: 'b', updatedAt: new Date(0) },
    ]);

    // A chunk that starts inside the builds and runs past their end must pick
    // vibe pages up from their own offset 0, not from the chunk's offset.
    await SITEMAP_SECTIONS.builds.page(18, 10);

    expect(prismaMock.userBuild.findMany.mock.calls[0][0]).toMatchObject({ skip: 18, take: 10 });
    expect(prismaMock.vibePage.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 8 });
  });

  it('drops a job whose latest verification does not say it is live', async () => {
    // Google Jobs penalises a JobPosting whose listing has expired, so an
    // unverified row must not reach the sitemap even though it is `active`.
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    prismaMock.ladderJob.findMany.mockResolvedValue([
      {
        id: 'live',
        lastVerifiedAt: new Date(0),
        lastCheckedAt: null,
        discoveredAt: new Date(0),
        verifications: [{ status: 'verified_active' }],
      },
      {
        id: 'stale',
        lastVerifiedAt: null,
        lastCheckedAt: null,
        discoveredAt: new Date(0),
        verifications: [{ status: 'dead' }],
      },
      {
        id: 'unchecked',
        lastVerifiedAt: null,
        lastCheckedAt: null,
        discoveredAt: new Date(0),
        verifications: [],
      },
    ]);

    const entries = await SITEMAP_SECTIONS.jobs.page(0, 10);
    expect(entries.map((e) => e.loc)).toEqual(['/rmhladder/jobs/live']);
  });

  it('lists only active home listings', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    await SITEMAP_SECTIONS.homes.page(0, 10);
    expect(prismaMock.homeListing.findMany.mock.calls[0][0].where).toEqual({ status: 'ACTIVE' });
  });

  it('never queries a table without a visibility filter', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    for (const section of Object.values(SITEMAP_SECTIONS)) await section.page(0, 10);

    // `blogPost` and `album` are wholly public, so they are the only two
    // allowed to enumerate unfiltered.
    const unfiltered = Object.entries(prismaMock)
      .filter(([name]) => !['blogPost', 'album'].includes(name))
      .filter(([, model]) =>
        model.findMany.mock.calls.some((call) => !call[0] || call[0].where === undefined),
      )
      .map(([name]) => name);
    expect(unfiltered).toEqual([]);
  });
});

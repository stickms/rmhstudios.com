/**
 * The RMH News reads must not ship article bodies or cached summaries.
 *
 * The front page (`getNewsFront`) is dehydrated into the SSR HTML once per headline, thirty headlines a page; the RSS
 * feed (`getAllNewsArticles`) is fetched by every reader's feed client. Neither renders an editorial article's markdown
 * `content` or the stored summary, so neither may select them, and both are bounded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findMany, findUnique, count } = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => {
  const client = { newsArticle: { findMany, findUnique, count } };
  return { prisma: client, prismaRead: client };
});

import {
  NEWS_FRONT_SELECT,
  NEWS_LIST_SELECT,
  NEWS_PAGE_SIZE,
  getAllNewsArticles,
  getNewsArticleBySlug,
  getNewsFront,
} from '@/lib/news';

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  findUnique.mockReset().mockResolvedValue(null);
  count.mockReset().mockResolvedValue(0);
});

describe('news selects', () => {
  it('never select the body, the summary or bookkeeping columns', () => {
    for (const select of [NEWS_LIST_SELECT, NEWS_FRONT_SELECT]) {
      const keys = Object.keys(select);
      for (const heavy of ['content', 'summary', 'discordMessageId', 'status', 'createdAt', 'updatedAt']) {
        expect(keys).not.toContain(heavy);
      }
    }
  });

  it('the front select is exactly what a story row and the lead draw', () => {
    expect(Object.keys(NEWS_FRONT_SELECT).sort()).toEqual(
      ['category', 'description', 'image', 'publishedAt', 'slug', 'sourcePublisher', 'title'].sort(),
    );
  });
});

describe('getNewsFront', () => {
  it('reads one page of published headlines, newest first, with the front select', async () => {
    await getNewsFront({ category: 'Science', page: 3 });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: 'PUBLISHED', category: 'Science' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      skip: 2 * NEWS_PAGE_SIZE,
      take: NEWS_PAGE_SIZE,
      select: NEWS_FRONT_SELECT,
    });
    expect(count).toHaveBeenCalledWith({ where: { status: 'PUBLISHED', category: 'Science' } });
  });

  it('matches every search word somewhere, case-insensitively', async () => {
    await getNewsFront({ q: '  nasa   moon ' });
    const where = findMany.mock.calls[0]?.[0].where;
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR[0]).toEqual({ title: { contains: 'nasa', mode: 'insensitive' } });
  });
});

describe('getAllNewsArticles (RSS)', () => {
  it('is one bounded query with the list select', async () => {
    await getAllNewsArticles();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: 'PUBLISHED' },
      take: 60,
      select: NEWS_LIST_SELECT,
    });
  });

  it('the article page still reads the whole row from the primary', async () => {
    await getNewsArticleBySlug('x');
    expect(findUnique).toHaveBeenCalledWith({ where: { slug: 'x' } });
  });
});

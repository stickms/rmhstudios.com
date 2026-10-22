/**
 * WS4 — the /news list must not ship article bodies.
 *
 * `getAllNewsArticles` / `getFeaturedNewsArticles` feed the `/news` loader (which
 * is dehydrated into the SSR HTML) and the RSS feed. Both used to `SELECT *`,
 * so the full markdown `content` of every published article — twice for the
 * featured ones — rode along in a payload no list consumer reads it from.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findMany, findUnique } = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));

vi.mock('@/lib/prisma.server', () => {
  const client = { newsArticle: { findMany, findUnique } };
  return { prisma: client, prismaRead: client };
});

import {
  NEWS_LIST_SELECT,
  getAllNewsArticles,
  getFeaturedNewsArticles,
  getNewsArticleBySlug,
} from '@/lib/news';

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  findUnique.mockReset().mockResolvedValue(null);
});

describe('news list select', () => {
  it('never selects the article body or bookkeeping columns', () => {
    const keys = Object.keys(NEWS_LIST_SELECT);
    for (const heavy of ['content', 'discordMessageId', 'status', 'createdAt', 'updatedAt']) {
      expect(keys).not.toContain(heavy);
    }
  });

  it('keeps every field the list, hero, card and RSS render', () => {
    for (const field of [
      'slug',
      'title',
      'date',
      'description',
      'category',
      'tags',
      'image',
      'sourcePublisher',
      'sourceUrl',
    ]) {
      expect(NEWS_LIST_SELECT).toHaveProperty(field, true);
    }
  });

  it('getAllNewsArticles issues ONE query with the list select', async () => {
    await getAllNewsArticles();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'PUBLISHED' },
      orderBy: { date: 'desc' },
      select: NEWS_LIST_SELECT,
    });
  });

  it('getFeaturedNewsArticles issues ONE query with the list select', async () => {
    await getFeaturedNewsArticles();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'PUBLISHED', featured: true },
      select: NEWS_LIST_SELECT,
    });
  });

  it('the article page still reads the whole row', async () => {
    await getNewsArticleBySlug('x');
    expect(findUnique).toHaveBeenCalledWith({ where: { slug: 'x' } });
  });
});

/**
 * News story timelines (L5) — server only.
 *
 * A story is a set of related news articles shown as one dated timeline. Admins
 * link articles into it; the suggestion list helps them find candidates by tag
 * overlap, and by embedding similarity when an embeddings provider is configured
 * (it degrades to tags alone otherwise — see lib/search/embeddings.server.ts).
 */

import { prisma } from '@/lib/prisma.server';
import { isEmbeddingStoreReady, similarTo } from '@/lib/search/embeddings.server';
import {
  storySlug,
  type AdminStory,
  type StoryArticle,
  type StoryPageData,
  type StoryRef,
  type StorySuggestion,
} from './schema';

export async function getStoryForArticle(articleSlug: string): Promise<StoryRef | null> {
  const link = await prisma.newsStoryArticle.findUnique({
    where: { articleSlug },
    select: {
      story: { select: { slug: true, title: true, _count: { select: { articles: true } } } },
    },
  });
  if (!link) return null;
  return { slug: link.story.slug, title: link.story.title, count: link.story._count.articles };
}

const ARTICLE_SELECT = {
  slug: true,
  title: true,
  date: true,
  description: true,
  category: true,
  image: true,
} as const;

export async function getStoryPage(slug: string): Promise<StoryPageData | null> {
  const story = await prisma.newsStory.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      summary: true,
      articles: { take: 200, select: { articleSlug: true } },
    },
  });
  if (!story) return null;
  const articles: StoryArticle[] = await prisma.newsArticle.findMany({
    where: { slug: { in: story.articles.map((a) => a.articleSlug) }, status: 'PUBLISHED' },
    select: ARTICLE_SELECT,
  });
  articles.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  return { slug: story.slug, title: story.title, summary: story.summary, articles };
}

/** Published stories with at least one published article, newest activity first. */
export async function listPublicStories(take = 40) {
  const rows = await prisma.newsStory.findMany({
    orderBy: { updatedAt: 'desc' },
    take,
    select: { slug: true, title: true, summary: true, _count: { select: { articles: true } } },
  });
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    count: r._count.articles,
  }));
}

/* ── admin ────────────────────────────────────────────────────────────────── */

export async function listStoriesAdmin(): Promise<AdminStory[]> {
  const stories = await prisma.newsStory.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      articles: { take: 200, select: { articleSlug: true } },
    },
  });
  const slugs = stories.flatMap((s) => s.articles.map((a) => a.articleSlug));
  const articles = slugs.length
    ? await prisma.newsArticle.findMany({
        where: { slug: { in: slugs } },
        select: { slug: true, title: true, date: true },
      })
    : [];
  const bySlug = new Map(articles.map((a) => [a.slug, a]));
  return stories.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    summary: s.summary,
    articles: s.articles
      .map((a) => bySlug.get(a.articleSlug))
      .filter((a): a is { slug: string; title: string; date: string } => a !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date)),
  }));
}

async function uniqueSlug(title: string): Promise<string> {
  const base = storySlug(title);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await prisma.newsStory.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createStory(userId: string, input: { title: string; summary: string }) {
  const slug = await uniqueSlug(input.title);
  return prisma.newsStory.create({
    data: { slug, title: input.title, summary: input.summary, createdById: userId },
    select: { id: true, slug: true, title: true, summary: true },
  });
}

export async function updateStory(id: string, input: { title: string; summary: string }) {
  const exists = await prisma.newsStory.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;
  return prisma.newsStory.update({
    where: { id },
    data: { title: input.title, summary: input.summary },
    select: { id: true, slug: true, title: true, summary: true },
  });
}

export async function deleteStory(id: string): Promise<boolean> {
  const { count } = await prisma.newsStory.deleteMany({ where: { id } });
  return count > 0;
}

/** Link an article to a story, moving it out of any story it was in. */
export async function linkArticle(storyId: string, articleSlug: string): Promise<boolean> {
  const [story, article] = await Promise.all([
    prisma.newsStory.findUnique({ where: { id: storyId }, select: { id: true } }),
    prisma.newsArticle.findUnique({ where: { slug: articleSlug }, select: { slug: true } }),
  ]);
  if (!story || !article) return false;
  await prisma.newsStoryArticle.upsert({
    where: { articleSlug },
    create: { storyId, articleSlug },
    update: { storyId },
  });
  await prisma.newsStory.update({ where: { id: storyId }, data: { updatedAt: new Date() } });
  return true;
}

export async function unlinkArticle(articleSlug: string): Promise<boolean> {
  const { count } = await prisma.newsStoryArticle.deleteMany({ where: { articleSlug } });
  return count > 0;
}

/**
 * Candidate articles for a story: not yet in any story, sharing tags with the
 * story's articles (ranked by overlap), plus semantic neighbours when available.
 */
export async function suggestForStory(storyId: string): Promise<StorySuggestion[]> {
  const members = await prisma.newsStoryArticle.findMany({
    where: { storyId },
    take: 50,
    select: { articleSlug: true },
  });
  if (members.length === 0) return [];
  const memberArticles = await prisma.newsArticle.findMany({
    where: { slug: { in: members.map((m) => m.articleSlug) } },
    select: { id: true, slug: true, tags: true },
  });
  const tagSet = new Set(memberArticles.flatMap((a) => a.tags));
  const claimed = new Set(
    (await prisma.newsStoryArticle.findMany({ select: { articleSlug: true }, take: 5000 })).map(
      (l) => l.articleSlug,
    ),
  );

  const out = new Map<string, StorySuggestion>();

  if (tagSet.size > 0) {
    const byTag = await prisma.newsArticle.findMany({
      where: { status: 'PUBLISHED', tags: { hasSome: [...tagSet] } },
      orderBy: { date: 'desc' },
      take: 60,
      select: { slug: true, title: true, date: true, tags: true },
    });
    const scored = byTag
      .filter((a) => !claimed.has(a.slug))
      .map((a) => ({ a, overlap: a.tags.filter((t) => tagSet.has(t)) }))
      .sort((x, y) => y.overlap.length - x.overlap.length)
      .slice(0, 8);
    for (const { a, overlap } of scored) {
      out.set(a.slug, { slug: a.slug, title: a.title, date: a.date, reason: 'tags', overlap });
    }
  }

  if (await isEmbeddingStoreReady()) {
    const neighbours = (
      await Promise.all(
        memberArticles.slice(0, 3).map((m) => similarTo('news', m.id, 6).catch(() => [])),
      )
    ).flat();
    const ids = [...new Set(neighbours.filter((n) => n.distance < 0.35).map((n) => n.entityId))];
    if (ids.length) {
      const rows = await prisma.newsArticle.findMany({
        where: { id: { in: ids }, status: 'PUBLISHED' },
        select: { slug: true, title: true, date: true },
        take: 10,
      });
      for (const a of rows) {
        if (!claimed.has(a.slug) && !out.has(a.slug)) {
          out.set(a.slug, { ...a, reason: 'similar', overlap: [] });
        }
      }
    }
  }
  return [...out.values()].slice(0, 12);
}

/** Admin picker: recent published articles matching a title fragment. */
export async function searchArticles(q: string) {
  return prisma.newsArticle.findMany({
    where: {
      status: 'PUBLISHED',
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: { date: 'desc' },
    take: 20,
    select: { slug: true, title: true, date: true },
  });
}

/**
 * News story timelines (L5) — server only.
 *
 * A story is a set of related news articles shown as one dated timeline. Admins
 * link articles into it; the suggestion list helps them find candidates by tag
 * overlap, and by embedding similarity when an embeddings provider is configured
 * (it degrades to tags alone otherwise — see lib/search/embeddings.server.ts).
 */

import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { enqueueStoryArticleFanout } from '@/lib/reading/story-follows.server';
import { NEWS_STORY_FOLLOW_LIMIT, atStoryFollowCap } from '@/lib/reading/story-follows';
import {
  STORIES_PAGE_SIZE,
  aggregatePublished,
  pageStories,
  sortStories,
  type StoryIndexRow,
} from '@/lib/reading/stories-index';
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

/**
 * Stories with at least one published article, newest published article first, one page after `cursor`
 * (`/news/stories`). A story whose articles are all drafts or hidden is not listed.
 */
export async function listPublicStories(
  cursor: string | null = null,
  size: number = STORIES_PAGE_SIZE,
): Promise<{ stories: StoryIndexRow[]; nextCursor: string | null }> {
  const links = await prisma.newsStoryArticle.findMany({
    take: 5000,
    select: { storyId: true, articleSlug: true },
  });
  if (links.length === 0) return { stories: [], nextCursor: null };
  const articles = await prisma.newsArticle.findMany({
    where: { slug: { in: links.map((l) => l.articleSlug) }, status: 'PUBLISHED' },
    select: { slug: true, date: true, status: true },
  });
  const byArticle = new Map(articles.map((a) => [a.slug, a]));
  const aggregates = aggregatePublished(
    links.flatMap((l) => {
      const a = byArticle.get(l.articleSlug);
      return a ? [{ storyId: l.storyId, status: a.status, date: a.date }] : [];
    }),
  );
  if (aggregates.length === 0) return { stories: [], nextCursor: null };
  const stories = await prisma.newsStory.findMany({
    where: { id: { in: aggregates.map((a) => a.storyId) } },
    select: { id: true, slug: true, title: true, summary: true },
  });
  const byId = new Map(stories.map((s) => [s.id, s]));
  const rows = aggregates.flatMap((a) => {
    const s = byId.get(a.storyId);
    return s ? [{ slug: s.slug, title: s.title, summary: s.summary, count: a.count, latest: a.latest }] : [];
  });
  return pageStories(sortStories(rows), cursor, size);
}

/** The story's published articles, newest first, for its RSS feed. Null when the story does not exist. */
export async function getStoryFeed(slug: string) {
  const story = await getStoryPage(slug);
  if (!story) return null;
  return { ...story, articles: [...story.articles].reverse() };
}

/* ── following ────────────────────────────────────────────────────────────── */

export type FollowStoryResult =
  | { ok: true; following: true }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NEWS_STORY_FOLLOW_LIMIT'; max: number };

/** Follow a story. Following twice is the same as once; past {@link NEWS_STORY_FOLLOW_LIMIT} stories is refused. */
export async function followStory(userId: string, slug: string): Promise<FollowStoryResult> {
  const story = await prisma.newsStory.findUnique({ where: { slug }, select: { id: true } });
  if (!story) return { ok: false, code: 'NOT_FOUND' };
  return prisma.$transaction(async (tx): Promise<FollowStoryResult> => {
    // The cap is a check-then-insert: two requests must not both pass it.
    await lockKey(tx, `news-story-follows:${userId}`);
    const existing = await tx.newsStoryFollow.findUnique({
      where: { storyId_userId: { storyId: story.id, userId } },
      select: { storyId: true },
    });
    if (existing) return { ok: true, following: true };
    const count = await tx.newsStoryFollow.count({ where: { userId } });
    if (atStoryFollowCap(count)) return { ok: false, code: 'NEWS_STORY_FOLLOW_LIMIT', max: NEWS_STORY_FOLLOW_LIMIT };
    await tx.newsStoryFollow.create({ data: { storyId: story.id, userId } });
    return { ok: true, following: true };
  });
}

/**
 * Stop following. Not following is the same as having stopped. A story has one follow from the member's view: the
 * story-page follow and the older reading subscription (settings, daily email) are the same toggle, so this removes
 * both.
 */
export async function unfollowStory(userId: string, slug: string): Promise<void> {
  await prisma.newsStoryFollow.deleteMany({ where: { userId, story: { slug } } });
  await prisma.readingSubscription.deleteMany({ where: { userId, kind: 'news_story', target: slug } });
}

/** True when the member follows the story either way: the story follow or a reading subscription to it. */
export async function isFollowingStory(userId: string, slug: string): Promise<boolean> {
  const row = await prisma.newsStoryFollow.findFirst({ where: { userId, story: { slug } }, select: { storyId: true } });
  if (row) return true;
  const sub = await prisma.readingSubscription.findFirst({
    where: { userId, kind: 'news_story', target: slug },
    select: { id: true },
  });
  return !!sub;
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

/**
 * Link an article to a story, moving it out of any story it was in. When the article is published, the story's
 * followers are told once, on a durable fan-out queued after the link is written; an unlink tells nobody.
 */
export async function linkArticle(storyId: string, articleSlug: string): Promise<boolean> {
  const [story, article] = await Promise.all([
    prisma.newsStory.findUnique({ where: { id: storyId }, select: { id: true } }),
    prisma.newsArticle.findUnique({ where: { slug: articleSlug }, select: { slug: true, status: true } }),
  ]);
  if (!story || !article) return false;
  await prisma.newsStoryArticle.upsert({
    where: { articleSlug },
    create: { storyId, articleSlug },
    update: { storyId },
  });
  await prisma.newsStory.update({ where: { id: storyId }, data: { updatedAt: new Date() } });
  if (article.status === 'PUBLISHED') await enqueueStoryArticleFanout(storyId, articleSlug);
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

import { prisma, prismaRead } from "@/lib/prisma.server";
import type { NewsArticle as PrismaNewsArticle, Prisma } from "@prisma/client";

export type NewsArticle = PrismaNewsArticle;

/**
 * What the RSS feed reads: everything but `content` (an editorial article's full markdown body) and the bookkeeping
 * columns (`discordMessageId`, `status`, the cached summary, timestamps) no feed reader renders. The article page loads
 * the whole row via {@link getNewsArticleBySlug}.
 */
export const NEWS_LIST_SELECT = {
    id: true,
    slug: true,
    title: true,
    date: true,
    description: true,
    category: true,
    tags: true,
    featured: true,
    sourceTitle: true,
    sourceUrl: true,
    sourcePublisher: true,
    sourceDate: true,
    image: true,
    origin: true,
    publishedAt: true,
} as const;

export type NewsListItem = Pick<PrismaNewsArticle, keyof typeof NEWS_LIST_SELECT>;

/**
 * The RMH News front page's read: exactly what a story row and the lead story draw (components/news/NewsStoryRow,
 * NewsLead). The page is serialised into the SSR HTML, so every column here ships once per headline; the excerpt is
 * capped at ingest (lib/news-wire/parse.ts) and the article body and the summary never ride along.
 */
export const NEWS_FRONT_SELECT = {
    slug: true,
    title: true,
    description: true,
    category: true,
    image: true,
    sourcePublisher: true,
    publishedAt: true,
} as const;

export type NewsFrontItem = Pick<PrismaNewsArticle, keyof typeof NEWS_FRONT_SELECT>;

/** Headlines per front page. The first page opens with a lead story and four beside it. */
export const NEWS_PAGE_SIZE = 30;

export interface NewsFrontQuery {
    category?: string | undefined;
    q?: string | undefined;
    page?: number | undefined;
}

function frontWhere({ category, q }: NewsFrontQuery): Prisma.NewsArticleWhereInput {
    const terms = (q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
    return {
        status: "PUBLISHED",
        ...(category ? { category } : {}),
        ...(terms.length
            ? {
                  AND: terms.map((term) => ({
                      OR: [
                          { title: { contains: term, mode: "insensitive" as const } },
                          { description: { contains: term, mode: "insensitive" as const } },
                          { sourcePublisher: { contains: term, mode: "insensitive" as const } },
                      ],
                  })),
              }
            : {}),
    };
}

// The list reads below are public, anonymous-invariant and tolerate replica lag (a headline stored a second ago
// appearing a second later); none feeds a write. The by-slug read stays on the primary: the summary endpoint writes
// to the row it reads, and the admin edit flow re-reads straight after saving.

/** One page of the front: newest first, optionally one category and a search. */
export async function getNewsFront(query: NewsFrontQuery): Promise<{ items: NewsFrontItem[]; total: number }> {
    const where = frontWhere(query);
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const [items, total] = await Promise.all([
        prismaRead.newsArticle.findMany({
            where,
            orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
            skip: (page - 1) * NEWS_PAGE_SIZE,
            take: NEWS_PAGE_SIZE,
            select: NEWS_FRONT_SELECT,
        }),
        prismaRead.newsArticle.count({ where }),
    ]);
    return { items, total };
}

/** "More in this category" under an article: the newest others, with pictures first only by recency. */
export async function getRelatedNews(category: string, exceptSlug: string, take = 5): Promise<NewsFrontItem[]> {
    return prismaRead.newsArticle.findMany({
        where: { status: "PUBLISHED", category, slug: { not: exceptSlug } },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take,
        select: NEWS_FRONT_SELECT,
    });
}

export async function getNewsArticleBySlug(slug: string): Promise<NewsArticle | null> {
    return prisma.newsArticle.findUnique({ where: { slug } });
}

/** The newest published articles for the RSS feed (at most `take`). */
export async function getAllNewsArticles(take = 60): Promise<NewsListItem[]> {
    return prismaRead.newsArticle.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take,
        select: NEWS_LIST_SELECT,
    });
}

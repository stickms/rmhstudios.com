import { prisma, prismaRead } from "@/lib/prisma.server";
import type { NewsArticle as PrismaNewsArticle } from "@prisma/client";

export type NewsArticle = PrismaNewsArticle;

/**
 * What a news LIST (the /news page, its featured carousel, the RSS feed) reads:
 * everything but `content` — the full markdown body, the bulk of every row — and
 * the bookkeeping columns (`discordMessageId`, `status`, timestamps) no list
 * consumer renders. The list is serialised into the SSR payload, so each column
 * selected here ships once per article, twice for featured ones. The article
 * page loads the whole row via {@link getNewsArticleBySlug}.
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
} as const;

/**
 * The /news index page's narrower read: exactly the fields the list, search,
 * category tabs and hero render (components/news/NewsList|NewsCard|NewsHero|
 * NewsSourceBadge), which is a subset of {@link NEWS_LIST_SELECT} (the RSS feed
 * also wants `id`, `image`, `sourceTitle`, `sourceDate`). The index is
 * serialised into the SSR HTML, so every extra column ships once per article.
 */
export const NEWS_INDEX_SELECT = {
    slug: true,
    title: true,
    date: true,
    description: true,
    category: true,
    tags: true,
    featured: true,
    sourcePublisher: true,
    sourceUrl: true,
} as const;

export type NewsIndexItem = Pick<PrismaNewsArticle, keyof typeof NEWS_INDEX_SELECT>;

export type NewsListItem = Pick<PrismaNewsArticle, keyof typeof NEWS_LIST_SELECT>;

// The list reads below are public, anonymous-invariant and tolerate replica lag
// (an article published a second ago appearing a second later); none feeds a
// write. The by-slug read stays on the primary: the admin edit flow re-reads it
// straight after saving.

export async function getNewsSlugs(): Promise<string[]> {
    const rows = await prismaRead.newsArticle.findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true },
        orderBy: { date: "desc" },
    });
    return rows.map((r) => r.slug);
}

export async function getNewsArticleBySlug(slug: string): Promise<NewsArticle | null> {
    return prisma.newsArticle.findUnique({ where: { slug } });
}

export async function getAllNewsArticles(): Promise<NewsListItem[]> {
    return prismaRead.newsArticle.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { date: "desc" },
        select: NEWS_LIST_SELECT,
    });
}

export async function getNewsIndexArticles(): Promise<NewsIndexItem[]> {
    return prismaRead.newsArticle.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { date: "desc" },
        select: NEWS_INDEX_SELECT,
    });
}

export async function getFeaturedNewsArticles(): Promise<NewsListItem[]> {
    return prismaRead.newsArticle.findMany({
        where: { status: "PUBLISHED", featured: true },
        orderBy: { date: "desc" },
        select: NEWS_LIST_SELECT,
    });
}

export async function getNewsCategories(): Promise<string[]> {
    const rows = await prismaRead.newsArticle.findMany({
        where: { status: "PUBLISHED" },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
    });
    return rows.map((r) => r.category);
}

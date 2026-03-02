import { prisma } from "@/lib/prisma";
import type { NewsArticle as PrismaNewsArticle } from "@prisma/client";

export type NewsArticle = PrismaNewsArticle;

export async function getNewsSlugs(): Promise<string[]> {
    const rows = await prisma.newsArticle.findMany({
        where: { status: "PUBLISHED" },
        select: { slug: true },
        orderBy: { date: "desc" },
    });
    return rows.map((r) => r.slug);
}

export async function getNewsArticleBySlug(slug: string): Promise<NewsArticle | null> {
    return prisma.newsArticle.findUnique({ where: { slug } });
}

export async function getAllNewsArticles(): Promise<NewsArticle[]> {
    return prisma.newsArticle.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { date: "desc" },
    });
}

export async function getFeaturedNewsArticles(): Promise<NewsArticle[]> {
    return prisma.newsArticle.findMany({
        where: { status: "PUBLISHED", featured: true },
        orderBy: { date: "desc" },
    });
}

export async function getNewsCategories(): Promise<string[]> {
    const rows = await prisma.newsArticle.findMany({
        where: { status: "PUBLISHED" },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
    });
    return rows.map((r) => r.category);
}

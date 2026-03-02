import fs from "fs";
import path from "path";
import matter from "gray-matter";

const newsDirectory = path.join(process.cwd(), "content/news");

export interface NewsArticle {
    slug: string;
    title: string;
    date: string;
    description: string;
    category: string;
    tags?: string[];
    featured?: boolean;
    sourceTitle: string;
    sourceUrl: string;
    sourcePublisher: string;
    sourceDate?: string;
    image?: string;
    content: string;
}

export function getNewsSlugs() {
    if (!fs.existsSync(newsDirectory)) {
        return [];
    }
    return fs.readdirSync(newsDirectory).filter((f) => f.endsWith(".mdx"));
}

export function getNewsArticleBySlug(slug: string, fields: string[] = []) {
    const realSlug = slug.replace(/\.mdx$/, "");
    const fullPath = path.join(newsDirectory, `${realSlug}.mdx`);

    if (!fs.existsSync(fullPath)) return null;

    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    type Items = {
        [key: string]: string | string[] | boolean | undefined;
    };

    const items: Items = {};

    fields.forEach((field) => {
        if (field === "slug") {
            items[field] = realSlug;
        }
        if (field === "content") {
            items[field] = content;
        }
        if (typeof data[field] !== "undefined") {
            items[field] = data[field];
        }
    });

    return items;
}

export function getAllNewsArticles(fields: string[] = []) {
    const slugs = getNewsSlugs();
    const articles = slugs
        .map((slug) => getNewsArticleBySlug(slug, fields))
        .filter(Boolean)
        .sort((a, b) => {
            const dateA = (a as Record<string, string>).date ?? "";
            const dateB = (b as Record<string, string>).date ?? "";
            return dateA > dateB ? -1 : 1;
        });
    return articles as Partial<NewsArticle>[];
}

export function getFeaturedNewsArticles(fields: string[] = []) {
    const allFields = [...new Set([...fields, "featured"])];
    return getAllNewsArticles(allFields).filter((a) => a.featured);
}

export function getNewsCategories(): string[] {
    const articles = getAllNewsArticles(["category"]);
    const categories = new Set<string>();
    articles.forEach((a) => {
        if (a.category) categories.add(a.category);
    });
    return Array.from(categories).sort();
}

import Parser from "rss-parser";
import { prisma } from "@/lib/prisma";
import { CATEGORY_QUERIES, buildRssUrl } from "./config";

const parser = new Parser();

export interface FetchedArticle {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  publisher: string;
  category: string;
}

/**
 * Follows Google News RSS redirect URLs to resolve the actual source article URL.
 * Google News item.link values are redirect chains — this resolves to the real URL.
 */
async function resolveRealUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RMHStudios/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    // res.url is the final URL after all redirects
    if (!res.url.includes("google.com")) return res.url;
    return url; // fallback if redirect didn't escape google.com
  } catch {
    return url; // fallback on timeout / network error
  }
}

async function getExistingSourceUrls(): Promise<Set<string>> {
  const rows = await prisma.newsArticle.findMany({ select: { sourceUrl: true } });
  return new Set(rows.map((r) => r.sourceUrl));
}

function extractPublisher(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    return parts.length >= 2 ? parts[parts.length - 2] : hostname;
  } catch {
    return "Unknown";
  }
}

export async function fetchTopStory(category: string): Promise<FetchedArticle | null> {
  const query = CATEGORY_QUERIES[category];
  if (!query) return null;

  const rssUrl = buildRssUrl(query);
  const existingUrls = await getExistingSourceUrls();

  try {
    const feed = await parser.parseURL(rssUrl);

    for (const item of feed.items.slice(0, 15)) {
      if (!item.title || !item.link) continue;

      // Resolve the real article URL (Google News uses redirect links)
      const realLink = await resolveRealUrl(item.link);

      // Skip if we've already covered this URL (check both original and resolved)
      if (existingUrls.has(item.link) || existingUrls.has(realLink)) continue;

      const publisher =
        (item as { source?: { title?: string } }).source?.title ||
        extractPublisher(realLink);

      return {
        title: item.title,
        link: realLink,
        pubDate: item.pubDate || new Date().toISOString(),
        contentSnippet: item.contentSnippet || item.summary || "",
        publisher,
        category,
      };
    }
  } catch (err) {
    console.error(`[fetcher] Failed to fetch RSS for "${category}":`, err);
  }

  return null;
}

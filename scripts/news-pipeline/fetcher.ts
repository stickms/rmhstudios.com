import Parser from "rss-parser";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { CATEGORY_QUERIES, buildRssUrl, NEWS_DIR, STAGING_DIR } from "./config";

const parser = new Parser();

export interface FetchedArticle {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  publisher: string;
  category: string;
}

function getExistingSourceUrls(): Set<string> {
  const urls = new Set<string>();
  const dirs = [NEWS_DIR, STAGING_DIR].map((d) => path.join(process.cwd(), d));

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), "utf-8");
        const { data } = matter(content);
        if (data.sourceUrl) urls.add(data.sourceUrl);
      } catch {
        // ignore unreadable files
      }
    }
  }

  return urls;
}

function extractPublisher(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Return the second-to-last segment (e.g., "theverge" from "theverge.com")
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
  const existingUrls = getExistingSourceUrls();

  try {
    const feed = await parser.parseURL(rssUrl);

    for (const item of feed.items.slice(0, 15)) {
      if (!item.title || !item.link) continue;

      // Skip if we've already covered this URL
      if (existingUrls.has(item.link)) continue;

      const publisher =
        (item as { source?: { title?: string } }).source?.title ||
        extractPublisher(item.link);

      return {
        title: item.title,
        link: item.link,
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

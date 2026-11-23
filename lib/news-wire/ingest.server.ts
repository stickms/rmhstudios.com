/**
 * RMH News ingest: every 20 minutes the jobs worker reads the public feeds in ./sources.ts, keeps the headlines it has
 * not seen, gives each a category (./categorize.ts) and a picture, and stores them as WIRE rows of `news_article`.
 * Rows older than {@link RETENTION_DAYS} are deleted unless an admin put them in a story timeline.
 *
 * Costs nothing per headline beyond the feed requests: no model runs here. The DeepSeek summary is written later and
 * only for the articles readers open (./summary.server.ts).
 *
 * A feed that fails (down, slow, renamed) is logged and skipped; the rest of the run carries on.
 */

import Parser from 'rss-parser';
import { prisma } from '@/lib/prisma.server';
import { createLogger } from '@/server/shared/logger';
import { invalidateTag } from '@/lib/cached.server';
import { categorize, matchedKeywords } from './categorize';
import { extractOgImage } from './extract';
import { fetchArticlePage, fetchText } from './fetch.server';
import { parseFeedItem, wireSlug, type FeedItem, type WireCandidate } from './parse';
import { NEWS_FRONT_TAG, NEWS_SOURCES, type NewsSource } from './sources';

export const NEWS_INGEST_QUEUE = 'news.ingest';
/** Every 20 minutes, off the hour and off the other sweeps' minutes. */
const INGEST_CRON = '7,27,47 * * * *';

/** How long a wire headline stays. Three weeks is long enough for "last week" and short enough to keep the table small. */
export const RETENTION_DAYS = 21;
/** The newest items read from each feed per run. Feeds list newest first; older ones were read by an earlier run. */
const ITEMS_PER_FEED = 30;
/** Article pages fetched per run to find a picture for feeds that publish none (Al Jazeera, ESPN, TechCrunch…). */
const IMAGE_LOOKUPS_PER_RUN = 40;
const CONCURRENCY = 4;

const log = createLogger('news-wire');

const parser: Parser<Record<string, unknown>, FeedItem> = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

/** Run `fn` over `items`, at most `limit` at a time. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return out;
}

interface SourcedCandidate extends WireCandidate {
  source: NewsSource;
}

async function readFeed(source: NewsSource): Promise<SourcedCandidate[]> {
  const xml = await fetchText(source.url, {
    maxBytes: 4_000_000,
    timeoutMs: 12_000,
    accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml',
  });
  if (!xml) {
    console.warn(`[news-wire] feed unavailable: ${source.id}`);
    return [];
  }
  try {
    const feed = await parser.parseString(xml);
    return feed.items
      .slice(0, ITEMS_PER_FEED)
      .map((item) => parseFeedItem(item, source))
      .filter((c): c is WireCandidate => c !== null)
      .map((c) => ({ ...c, source }));
  } catch (err) {
    console.warn(`[news-wire] feed unreadable: ${source.id}: ${(err as Error).message}`);
    return [];
  }
}

const titleKey = (c: SourcedCandidate) =>
  `${c.source.publisher}|${c.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()}`;

export interface IngestResult {
  feeds: number;
  seen: number;
  stored: number;
  pruned: number;
}

/** One ingest run. Exported for the worker and for a manual run (`pnpm exec tsx -e` from a shell). */
export async function ingestNews(now = new Date()): Promise<IngestResult> {
  const oldest = now.getTime() - RETENTION_DAYS * 86_400_000;
  const batches = await mapLimit(NEWS_SOURCES, CONCURRENCY, readFeed);
  const all = batches.flat().filter((c) => c.publishedAt.getTime() >= oldest);

  // One row per link, and one per headline per outlet (BBC lists a story in its top and section feeds).
  const byUrl = new Map<string, SourcedCandidate>();
  const titles = new Set<string>();
  for (const c of all) {
    const key = titleKey(c);
    if (byUrl.has(c.url) || titles.has(key)) continue;
    byUrl.set(c.url, c);
    titles.add(key);
  }

  const urls = [...byUrl.keys()];
  const existing = urls.length
    ? await prisma.newsArticle.findMany({ where: { sourceUrl: { in: urls } }, select: { sourceUrl: true } })
    : [];
  for (const row of existing) byUrl.delete(row.sourceUrl);
  const fresh = [...byUrl.values()];

  // Pictures for the feeds that publish none: the article page's og:image, newest stories first, a bounded number.
  const needImage = fresh
    .filter((c) => !c.imageUrl)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, IMAGE_LOOKUPS_PER_RUN);
  await mapLimit(needImage, CONCURRENCY, async (c) => {
    const html = await fetchArticlePage(c.url);
    if (html) c.imageUrl = extractOgImage(html, c.url);
  });

  let stored = 0;
  if (fresh.length) {
    const result = await prisma.newsArticle.createMany({
      data: fresh.map((c) => ({
        slug: wireSlug(c.title, c.url),
        title: c.title,
        date: c.publishedAt.toISOString().slice(0, 10),
        description: c.description,
        content: c.description,
        category: categorize({ title: c.title, description: c.description, tags: c.tags, hint: c.source.hint }),
        tags: matchedKeywords(c.title, c.description),
        featured: false,
        sourceTitle: c.title,
        sourceUrl: c.url,
        sourcePublisher: c.source.publisher,
        sourceDate: c.publishedAt.toISOString(),
        image: c.imageUrl,
        status: 'PUBLISHED' as const,
        origin: 'WIRE' as const,
        feedId: c.source.id,
        publishedAt: c.publishedAt,
      })),
      skipDuplicates: true,
    });
    stored = result.count;
  }

  const pruned = await pruneWire(new Date(oldest));
  if (stored > 0 || pruned > 0) await invalidateTag(NEWS_FRONT_TAG);
  return { feeds: NEWS_SOURCES.length, seen: all.length, stored, pruned };
}

/** Delete wire rows published before `before`, except those an admin placed in a story timeline. */
export async function pruneWire(before: Date): Promise<number> {
  const inStories = await prisma.newsStoryArticle.findMany({ select: { articleSlug: true } });
  const result = await prisma.newsArticle.deleteMany({
    where: {
      origin: 'WIRE',
      publishedAt: { lt: before },
      ...(inStories.length ? { slug: { notIn: inStories.map((s) => s.articleSlug) } } : {}),
    },
  });
  return result.count;
}

export async function registerNewsIngestCron(boss: {
  createQueue: (name: string, options?: object) => Promise<unknown>;
  schedule: (name: string, cron: string, data: object, options: object) => Promise<unknown>;
  work: (name: string, handler: () => Promise<void>) => Promise<unknown>;
  send?: (name: string, data: object, options?: object) => Promise<unknown>;
}): Promise<void> {
  await boss.createQueue(NEWS_INGEST_QUEUE, { policy: 'exclusive' });
  await boss.schedule(NEWS_INGEST_QUEUE, INGEST_CRON, {}, { tz: 'UTC' });
  await boss.work(NEWS_INGEST_QUEUE, async () => {
    const started = Date.now();
    const result = await ingestNews();
    log.info({
      event: 'news_wire.ingest',
      stored: result.stored,
      seen: result.seen,
      feeds: result.feeds,
      pruned: result.pruned,
      ms: Date.now() - started,
    });
  });
  // A fresh deploy should not wait up to 20 minutes for its first headlines.
  await boss.send?.(NEWS_INGEST_QUEUE, {}, { singletonKey: 'boot' }).catch(() => undefined);
}

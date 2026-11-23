/**
 * RMH News summaries: written by DeepSeek the first time a reader opens an article, stored on the row, and served from
 * the row to every reader after that. Headlines nobody opens never cost a token.
 *
 * What keeps the bill bounded:
 *  - Only the article page asks, and only from the browser after it has painted (a POST from
 *    `components/news/NewsSummary.tsx`), so crawlers and link unfurlers that render the HTML never trigger one.
 *  - One generation per article, ever: the stored summary is returned without a model call, a concurrent second
 *    request in this process waits on the first, and the write is conditional so two processes cannot both store.
 *  - A page with no readable article is remembered as '' for a day instead of being retried on every click.
 *  - At most {@link dailyCap} new summaries per rolling 24 hours (`NEWS_SUMMARY_DAILY_CAP`, default 400); past it,
 *    readers see the cached ones and "Summary unavailable right now" on the rest.
 *  - The endpoint is rate-limited per IP (lib/news-wire/api/news.summary.server.ts).
 *
 * The model reads the outlet's own article text (wrapped as data, `asData`), never the headline alone: a summary of a
 * headline would be a guess.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { asData, NEWS_SUMMARY, systemFor } from '@/lib/ai/prompts';
import { isAiConfigured, runTaskJson } from '@/lib/ai/provider.server';
import { ARTICLE_TEXT_MAX, ARTICLE_TEXT_MIN, extractArticleText, extractOgImage } from './extract';
import { fetchArticlePage } from './fetch.server';
import { parseStoredSummary, toNewsSummary, type NewsSummary, type SummaryResult } from './summary';

/** After a page yielded no text, how long before a reader's click tries it again. */
const RETRY_EMPTY_AFTER_MS = 86_400_000;

export function dailyCap(): number {
  const raw = Number(process.env.NEWS_SUMMARY_DAILY_CAP);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 400;
}

/** Requests for an article whose summary is being written right now wait for that one instead of starting another. */
const inflight = new Map<string, Promise<SummaryResult>>();

const SUMMARY_SELECT = {
  id: true,
  slug: true,
  title: true,
  status: true,
  origin: true,
  content: true,
  image: true,
  sourceUrl: true,
  sourcePublisher: true,
  summary: true,
  summarizedAt: true,
} as const;

/** The stored summary for an article page's loader: what it can draw without asking. Never calls the model. */
export function storedSummary(row: { summary: string | null }): NewsSummary | null {
  return parseStoredSummary(row.summary);
}

/**
 * The article's summary, written now if it has none. Returns null when there is no published article with that slug.
 */
export async function getOrCreateSummary(slug: string, now = new Date()): Promise<SummaryResult | null> {
  const row = await prisma.newsArticle.findUnique({ where: { slug }, select: SUMMARY_SELECT });
  if (!row || row.status !== 'PUBLISHED') return null;

  const stored = parseStoredSummary(row.summary);
  if (stored) return { status: 'ready', summary: stored };
  if (row.summary === '' && row.summarizedAt && now.getTime() - row.summarizedAt.getTime() < RETRY_EMPTY_AFTER_MS) {
    return { status: 'unavailable', reason: 'no-text' };
  }
  if (!isAiConfigured()) return { status: 'unavailable', reason: 'ai-off' };

  const pending = inflight.get(row.id);
  if (pending) return pending;
  const work = generate(row, now).finally(() => inflight.delete(row.id));
  inflight.set(row.id, work);
  return work;
}

type Row = Prisma.NewsArticleGetPayload<{ select: typeof SUMMARY_SELECT }>;

async function generate(row: Row, now: Date): Promise<SummaryResult> {
  const since = new Date(now.getTime() - 86_400_000);
  const today = await prisma.newsArticle.count({
    where: { summarizedAt: { gte: since }, summary: { not: '' } },
  });
  if (today >= dailyCap()) return { status: 'unavailable', reason: 'busy' };

  // A wire row holds only the feed's excerpt: the story is on the outlet's page. An editorial row is its own text.
  let text = '';
  let image: string | null = null;
  if (row.origin === 'WIRE') {
    const html = await fetchArticlePage(row.sourceUrl);
    if (html) {
      text = extractArticleText(html);
      if (!row.image) image = extractOgImage(html, row.sourceUrl);
    }
  } else if (row.content.length >= ARTICLE_TEXT_MIN) {
    text = row.content.slice(0, ARTICLE_TEXT_MAX);
  }

  if (!text) {
    await prisma.newsArticle.updateMany({
      where: { id: row.id, OR: [{ summary: null }, { summary: '' }] },
      data: { summary: '', summarizedAt: now, ...(image ? { image } : {}) },
    });
    return { status: 'unavailable', reason: 'no-text' };
  }

  let summary: NewsSummary | null;
  try {
    summary = await runTaskJson(
      'summarize',
      systemFor(NEWS_SUMMARY),
      `Headline: ${row.title}\nOutlet: ${row.sourcePublisher}\n\nArticle text:\n${asData(text)}`,
      toNewsSummary,
      { promptId: NEWS_SUMMARY.id, promptVer: NEWS_SUMMARY.version, maxTokens: 500, temperature: 0.2 },
    );
  } catch (err) {
    console.warn(`[news-wire] summary failed for ${row.id}: ${(err as Error).message}`);
    return { status: 'unavailable', reason: 'error' };
  }

  // The model judged the text not to be an article (empty points): remember that like an unreadable page.
  if (!summary) {
    await prisma.newsArticle.updateMany({
      where: { id: row.id, OR: [{ summary: null }, { summary: '' }] },
      data: { summary: '', summarizedAt: now, ...(image ? { image } : {}) },
    });
    return { status: 'unavailable', reason: 'no-text' };
  }

  await prisma.newsArticle.updateMany({
    where: { id: row.id, OR: [{ summary: null }, { summary: '' }] },
    data: { summary: JSON.stringify(summary), summarizedAt: now, ...(image ? { image } : {}) },
  });
  return { status: 'ready', summary };
}

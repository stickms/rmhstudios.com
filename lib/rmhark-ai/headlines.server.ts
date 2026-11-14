/**
 * Live outside-world headlines for the feed bots.
 *
 * This module only fetches and CLEANS. Everything in a feed is untrusted
 * third-party text that another module later places in an AI prompt, so nothing
 * here interprets it: titles and summaries come out as plain text with tags and
 * entities removed, whitespace collapsed and lengths capped, and links are kept
 * only when they are http(s).
 *
 * Fetches go through `safeFetch` (`lib/ssrf-guard.server.ts`): the feed URLs are
 * server-configured, but a feed can redirect, and the guard re-validates every
 * hop and pins the connection to a public address. No Prisma here.
 */

import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import { safeFetch } from '@/lib/ssrf-guard.server';
import { HEADLINE_MAX_AGE_H, type Headline } from './reaction-model';

type Env = Record<string, string | undefined>;

export const DEFAULT_HEADLINE_FEEDS: readonly string[] = [
  'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en',
];

const HOUR = 3_600_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_HEADLINES = 60;
const TITLE_MAX = 200;
const SUMMARY_MAX = 300;
const FUTURE_SLACK_MS = HOUR;
const DEFAULT_REFRESH_MS = 15 * 60_000;

/** `BOT_NEWS_FEEDS` (comma-separated https URLs) overrides the default; '' disables. */
export function headlineFeeds(env: Env = process.env): string[] {
  const raw = env.BOT_NEWS_FEEDS;
  if (raw === undefined) return [...DEFAULT_HEADLINE_FEEDS];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const candidate = part.trim();
    if (!candidate) continue;
    try {
      const u = new URL(candidate);
      if (u.protocol === 'https:' && !out.includes(u.href)) out.push(u.href);
    } catch {
      // not a URL: dropped
    }
  }
  return out;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ' ';
      try {
        return String.fromCodePoint(code);
      } catch {
        return ' ';
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? m;
  });
}

function stripTags(s: string): string {
  return s
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
}

/** HTML or text in, one line of plain text out. */
function toPlainText(input: string | undefined): string {
  if (!input) return '';
  let s = stripTags(input);
  s = decodeEntities(s);
  // Double-escaped feeds decode to markup on the first pass.
  s = stripTags(s);
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

function cap(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function normaliseLink(link: string): string | null {
  try {
    const u = new URL(link.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    return u.href;
  } catch {
    return null;
  }
}

function keyFor(normalisedLink: string): string {
  return createHash('sha256').update(normalisedLink).digest('hex').slice(0, 32);
}

interface FeedItemExtras {
  source?: unknown;
}

function sourceText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const underscore = (value as { _?: unknown })._;
    if (typeof underscore === 'string') return underscore;
  }
  return '';
}

const parser = new Parser<Record<string, never>, FeedItemExtras>({
  customFields: { item: ['source'] },
});

export async function parseFeed(xml: string, feedUrl: string, now: number): Promise<Headline[]> {
  const feed = await parser.parseString(xml);
  const feedTitle = toPlainText(feed.title);
  const out: Headline[] = [];
  for (const item of feed.items) {
    const link = item.link ? normaliseLink(item.link) : null;
    let title = toPlainText(item.title);
    if (!link || !title) continue;

    let source = toPlainText(sourceText(item.source)) || toPlainText(item.creator);

    // Google News: "Headline text - Publisher".
    const split = title.match(/^(.*\S)\s+-\s+([^-]{1,80})$/);
    const isGoogle = feedHost(feedUrl) === 'news.google.com';
    if (isGoogle && split && split[1] && split[2]) {
      title = split[1];
      if (!source) source = split[2].trim();
    }
    if (!source) source = feedTitle;
    if (!source) source = new URL(link).hostname.replace(/^www\./, '');
    if (!title) continue;

    const dateRaw = item.isoDate ?? item.pubDate;
    const parsed = dateRaw ? Date.parse(dateRaw) : NaN;
    const publishedAt = Number.isFinite(parsed) ? parsed : now;
    if (now - publishedAt > HEADLINE_MAX_AGE_H * HOUR) continue;
    if (publishedAt - now > FUTURE_SLACK_MS) continue;

    let summary = toPlainText(item.contentSnippet ?? item.content ?? item.summary);
    // Google News repeats the title (and publisher) as the description.
    if (summary === toPlainText(item.title) || summary === title) summary = '';

    out.push({
      key: keyFor(link),
      title: cap(title, TITLE_MAX),
      summary: cap(summary, SUMMARY_MAX),
      source: cap(source, 80),
      url: link,
      publishedAt,
    });
  }
  return out;
}

function feedHost(feedUrl: string): string {
  try {
    return new URL(feedUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

const guardedFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return safeFetch(url, { ...init, timeoutMs: FETCH_TIMEOUT_MS });
};

/** Read a response body as text, failing if it exceeds the size cap. */
async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error('feed too large');
  }
  if (!res.body) {
    const text = await res.text();
    if (text.length > MAX_BODY_BYTES) throw new Error('feed too large');
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error('feed too large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** The slice of the worker's logger this module uses. */
export type HeadlineLog = { warn(event: string, fields?: Record<string, unknown>): void };

export interface FetchHeadlinesOptions {
  feeds?: string[];
  now?: number;
  fetchImpl?: typeof fetch;
  log?: HeadlineLog;
}

export async function fetchHeadlines(opts: FetchHeadlinesOptions = {}): Promise<Headline[]> {
  try {
    const feeds = opts.feeds ?? headlineFeeds();
    const now = opts.now ?? Date.now();
    const doFetch = opts.fetchImpl ?? guardedFetch;

    const results = await Promise.all(
      feeds.map(async (feedUrl): Promise<Headline[]> => {
        try {
          const res = await doFetch(feedUrl, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: {
              accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
              'user-agent': 'Mozilla/5.0 (compatible; RMHStudios/1.0)',
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await parseFeed(await readCapped(res), feedUrl, now);
        } catch (err) {
          try {
            opts.log?.warn('bot_worker.headlines_feed_failed', {
              feed: feedUrl,
              error: err instanceof Error ? err.message : String(err),
            });
          } catch {
            // a throwing logger must not break the fetch
          }
          return [];
        }
      }),
    );

    const byKey = new Set<string>();
    const byTitle = new Set<string>();
    const merged: Headline[] = [];
    for (const h of results.flat().sort((a, b) => b.publishedAt - a.publishedAt)) {
      const titleKey = h.title.toLowerCase();
      if (byKey.has(h.key) || byTitle.has(titleKey)) continue;
      byKey.add(h.key);
      byTitle.add(titleKey);
      merged.push(h);
    }
    return merged.slice(0, MAX_HEADLINES);
  } catch {
    return [];
  }
}

// ─── Process-wide cache ───────────────────────────────────────────────
// A deliberate per-process cache (single-flight + last-good fallback), not a
// shared one: every worker process may refresh independently.

let cachedList: Headline[] = [];
let cachedAt = 0;
let hasFetched = false;
let inflight: Promise<void> | null = null;

function refreshMs(): number {
  const n = Number(process.env.BOT_NEWS_REFRESH_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REFRESH_MS;
}

function freshOnly(list: Headline[], now: number): Headline[] {
  return list.filter(
    (h) => now - h.publishedAt <= HEADLINE_MAX_AGE_H * HOUR && h.publishedAt - now <= FUTURE_SLACK_MS,
  );
}

/**
 * Fresh headlines from the cache, refreshed when stale. `log` gets each failed feed
 * (`bot_worker.headlines_feed_failed`) and, when feeds are configured but a refresh yields no fresh
 * headline at all, `bot_worker.headlines_refresh_empty` (once per refresh, so every refresh interval
 * at most). Never throws. A deliberately empty `BOT_NEWS_FEEDS` logs nothing.
 */
export async function getFreshHeadlines(
  now: number = Date.now(),
  log?: HeadlineLog,
): Promise<Headline[]> {
  if (!hasFetched || now - cachedAt >= refreshMs() || now < cachedAt) {
    if (!inflight) {
      inflight = (async () => {
        try {
          const feeds = headlineFeeds();
          const list = await fetchHeadlines({ now, feeds, ...(log ? { log } : {}) });
          // Keep the last good list when a refresh returns nothing.
          if (list.length > 0) cachedList = list;
          else if (feeds.length > 0) {
            try {
              log?.warn('bot_worker.headlines_refresh_empty', {
                feeds: feeds.length,
                keptFromLastRefresh: freshOnly(cachedList, now).length,
              });
            } catch {
              // a throwing logger must not break the refresh
            }
          }
        } finally {
          cachedAt = now;
          hasFetched = true;
          inflight = null;
        }
      })();
    }
    await inflight;
  }
  return freshOnly(cachedList, now);
}

export function resetHeadlineCache(): void {
  cachedList = [];
  cachedAt = 0;
  hasFetched = false;
  inflight = null;
}

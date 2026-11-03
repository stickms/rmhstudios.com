/** Fetches the public RSS feeds, normalises and caches. Server-only. See `news.ts` for the policy. */

import Parser from 'rss-parser';
import { currentCycle, phaseOf } from './calendar';
import { publishNews } from './events.server';
import {
  NEWS_FEEDS,
  dedupeNews,
  googleNewsFeed,
  normalizeNewsItem,
  type NewsFeed,
  type NewsItem,
  type RawFeedItem,
} from './news';
import { stateName } from './states';

const FEED_TIMEOUT_MS = 8_000;
const MAX_XML_BYTES = 3 * 1024 * 1024;
const PER_FEED = 40;
const KEEP = 80;
const LIVE_TTL_MS = 30_000;
const IDLE_TTL_MS = 5 * 60_000;

const parser = new Parser();

export interface NewsResult {
  items: NewsItem[];
  /** How many of the feeds answered, so the UI can say "3 of 10 sources". */
  sources: { ok: number; total: number };
  fetchedAt: string;
}

const memo = new Map<string, { at: number; value: NewsResult }>();
const inflight = new Map<string, Promise<NewsResult>>();
const seen = new Map<string, Set<string>>();

async function readFeed(feed: NewsFeed, now: number): Promise<NewsItem[]> {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    headers: {
      accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8',
      'user-agent': 'rmhstudios-elections/1.0 (+https://rmhstudios.com/elections)',
    },
  });
  if (!res.ok) throw new Error(`${feed.id}: HTTP ${res.status}`);
  const xml = await res.text();
  if (xml.length > MAX_XML_BYTES) throw new Error(`${feed.id}: feed implausibly large`);
  const parsed = await parser.parseString(xml);
  return (parsed.items ?? [])
    .slice(0, PER_FEED)
    .map((it) => normalizeNewsItem(it as RawFeedItem, feed, now))
    .filter((n): n is NewsItem => n !== null);
}

async function build(state: string | null, now: number): Promise<NewsResult> {
  const feeds: NewsFeed[] = state
    ? [googleNewsFeed(`${stateName(state)} election when:2d`), ...NEWS_FEEDS]
    : [googleNewsFeed('U.S. election results when:1d'), ...NEWS_FEEDS];
  const settled = await Promise.allSettled(feeds.map((f) => readFeed(f, now)));
  let ok = 0;
  const all: NewsItem[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      ok++;
      all.push(...r.value);
    } else {
      console.warn('[elections] news feed failed:', feeds[i].id, String(r.reason));
    }
  });
  let items = dedupeNews(all);
  // A state view keeps stories naming that state, plus national ones that name none (a Senate-wide story
  // matters in every state); stories naming OTHER states are dropped.
  if (state) items = items.filter((n) => n.states.length === 0 || n.states.includes(state));
  return { items: items.slice(0, KEEP), sources: { ok, total: feeds.length }, fetchedAt: new Date(now).toISOString() };
}

/** Election headlines, newest first. `state` narrows to a state's coverage. Never rejects. */
export async function getNews(state: string | null = null, now: number = Date.now()): Promise<NewsResult> {
  const key = state ?? '*';
  const cycle = currentCycle(new Date(now));
  const live = phaseOf(cycle.date, new Date(now)) !== 'archive';
  const ttl = live && phaseOf(cycle.date, new Date(now)) !== 'upcoming' ? LIVE_TTL_MS : IDLE_TTL_MS;
  const hit = memo.get(key);
  if (hit && now - hit.at < ttl) return hit.value;

  let p = inflight.get(key);
  if (!p) {
    p = build(state, now)
      .then((value) => {
        memo.set(key, { at: Date.now(), value });
        // Announce genuinely new headlines (not the first load, which would be a flood).
        const prior = seen.get(key);
        const ids = new Set(value.items.map((i) => i.id));
        if (prior && key === '*') publishNews(cycle.date, value.items.filter((i) => !prior.has(i.id)));
        seen.set(key, ids);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    return await p;
  } catch {
    return hit?.value ?? { items: [], sources: { ok: 0, total: 0 }, fetchedAt: new Date(now).toISOString() };
  }
}

/** Test seam. */
export function __resetNews() {
  memo.clear();
  inflight.clear();
  seen.clear();
}

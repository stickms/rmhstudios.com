/**
 * Contract for the RMH News summary endpoint (lib/news-wire/api/news.summary.server.ts). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { SummaryResult } from './summary';
import type { NewsDiscussionState } from './discussion';

/**
 * The article's DeepSeek summary, written on the first request and cached on the row. A POST, not a GET, so that no
 * crawler, prefetcher or link unfurler ever spends a token: only the article page's own script asks. 404 when there
 * is no published article with that slug.
 */
export const requestNewsSummaryApi = endpoint<{
  body: { slug: string };
  res: SummaryResult;
}>()({ method: 'POST', path: '/api/news/summary' });

/** The article's discussion: counts, the post page, and whether the viewer reposted it. 404 for an unknown slug. */
export const getNewsDiscussionApi = endpoint<{
  query: { slug: string };
  res: NewsDiscussionState;
}>()({ method: 'GET', path: '/api/news/discussion' });

/**
 * Open the article's discussion: makes its discussion post on first use (signed in only), then answers like the GET.
 * The caller comments on or reposts that post through the ordinary post endpoints.
 */
export const openNewsDiscussionApi = endpoint<{
  body: { slug: string };
  res: NewsDiscussionState;
}>()({ method: 'POST', path: '/api/news/discussion' });

/**
 * Contract for the RMH News summary endpoint (lib/news-wire/api/news.summary.server.ts). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { SummaryResult } from './summary';

/**
 * The article's DeepSeek summary, written on the first request and cached on the row. A POST, not a GET, so that no
 * crawler, prefetcher or link unfurler ever spends a token: only the article page's own script asks. 404 when there
 * is no published article with that slug.
 */
export const requestNewsSummaryApi = endpoint<{
  body: { slug: string };
  res: SummaryResult;
}>()({ method: 'POST', path: '/api/news/summary' });

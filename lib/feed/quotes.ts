import type { FeedItem } from '@/lib/feed-types';

/** Quotes returned per page. */
export const QUOTES_PAGE = 20;
/** Quotes-of-a-quote shown beneath each quote (one level of nesting). */
export const QUOTES_NESTED_PER_PARENT = 3;

export interface QuoteNode {
  item: FeedItem;
  /** Posts that quote `item` itself, newest first (capped). */
  quotes: FeedItem[];
}

export interface QuotesPage {
  items: QuoteNode[];
  nextCursor: string | null;
}

/**
 * The kinds of Feed (client-safe). A Feed is the one "show / notify me about
 * these people, tags or terms" object (`CustomFeed` in prisma/schema/social.prisma):
 *
 * - `feed`   — tags + people + keywords, built on /feeds (A4)
 * - `list`   — a curated set of accounts, read as its own timeline (/lists/$id)
 * - `search` — a saved universal search: `query` + `types` (§18)
 * - `alert`  — a keyword alert: `query`, `notify` on (A6)
 *
 * The kind decides which tab of /feeds manages a row and which fields its form
 * edits. It does not decide how the row is read: every kind goes through
 * `readFeedPage` in `lib/feeds/feeds.server.ts`.
 */
export const FEED_KINDS =
  [
    'feed',
    'list',
    'search',
    'alert',
  ] as const;
export type FeedKind =
  (typeof FEED_KINDS)[number];

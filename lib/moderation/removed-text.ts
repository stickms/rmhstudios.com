/**
 * The text a post or reply carries in place of its content once site
 * moderation removed it. Client-safe: the feed mappers (`lib/feed/timeline.ts`,
 * `lib/feed/quoted-original.ts`) and the API routes share these, so a removed
 * post reads the same in the feed, in a quote card and on its own page.
 */
export const REMOVED_POST_TEXT = '[This post was removed by site moderation]';
export const REMOVED_REPLY_TEXT = '[This reply was removed by site moderation]';

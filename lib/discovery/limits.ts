/**
 * Custom-feed limits, with no dependencies. `./schema` (zod) builds the feed
 * schema from these and re-exports them; the feed editor imports them from
 * here so the /feeds pages do not load zod for three numbers.
 */
export const MAX_FEED_TAGS = 5;
export const MAX_FEED_PEOPLE = 10;
export const MAX_FEED_KEYWORDS = 5;
export const MAX_FEEDS_PER_USER = 10;

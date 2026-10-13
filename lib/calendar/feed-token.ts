/** The shape of a calendar-feed token (K3): 24 random bytes, base64url. Anything else is a 404 before any query. */
export const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

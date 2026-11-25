/**
 * The shape of a Studio share token (s11-07), on its own so the `/studio` route can check `?share=` without pulling
 * the share module into the client entry (the route's options are in every page's critical path).
 */

/** A share token: `randomBytes(16)` as base64url, 22 characters. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

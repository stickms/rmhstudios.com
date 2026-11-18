/**
 * The admin email composer's limits and option lists. Client-safe and zod-free,
 * so the composer can read them without shipping the schemas
 * (`./campaign-schema.ts` re-exports them for the server side).
 */

export const MAX_SUBJECT = 200;
export const MAX_BODY = 20_000;
/** Manual selection is for a handful of people, not a list import. */
export const MAX_MANUAL_RECIPIENTS = 500;
/** Pictures in one email: the site's own images only (uploaded or AI-generated). */
export const MAX_EMAIL_IMAGES = 4;

/** The AI rewrites, the same six as the feed composer's writing assist. */
export const EMAIL_REWRITE_ACTIONS =
  [
    'improve',
    'fix',
    'shorten',
    'expand',
    'casual',
    'formal',
  ] as const;
export type EmailRewriteAction =
  (typeof EMAIL_REWRITE_ACTIONS)[number];

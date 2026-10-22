/**
 * RMHark size limits, with no dependencies.
 *
 * `lib/rmhark-schema.ts` re-exports these for the API routes, but client code
 * imports them from HERE. The schema module is zod, and the composers, the
 * comment box and the post page only need the numbers — importing the schema
 * for them put zod (~17 KB brotli) on the post-detail route and in the chunk
 * the lazy composer (`ComposeBoxLazy`) exists to keep small.
 */
export const MAX_RMHARK_LENGTH = 280;
export const MAX_RMHARK_IMAGES = 4;
// Per-image alt text (accessibility). Kept generous so screen-reader users get
// a full description; empty string = "no description provided".
export const MAX_IMAGE_ALT_LENGTH = 1000;
export const MAX_COMMENT_LENGTH = 500;
export const MAX_POLL_QUESTION_LENGTH = 200;
export const MAX_POLL_OPTION_LENGTH = 80;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 4;

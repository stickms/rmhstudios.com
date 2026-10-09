/**
 * RMHark size limits, with no dependencies.
 *
 * `lib/rmhark-schema.ts` re-exports these, and most callers should keep
 * importing from there. This module exists for the feed's first-paint path:
 * the compose placeholder (`ComposeBoxLazy`) shows the character budget so it
 * is the same height as the real composer, and importing the schema for one
 * number would pull zod into the chunk the lazy composer exists to keep small.
 */
export const MAX_RMHARK_LENGTH = 280;

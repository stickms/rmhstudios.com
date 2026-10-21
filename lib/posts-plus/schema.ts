/**
 * posts-plus — the zod input schemas for the X4/X5/X8/X9 API routes.
 *
 * Split from `./constants` so that module stays zod-free: it is reached from
 * the home feed (`lib/feed/timeline.ts`) and every post card, while these
 * schemas only ever run inside API handlers. Importing one from a component
 * puts zod (~17 KB brotli) back on the home route — components import
 * `./constants`.
 */

import { z } from 'zod';

import { MAX_QOTD_LENGTH, MAX_SAVE_NOTE, MAX_SERIES_DESCRIPTION, MAX_SERIES_TITLE, POST_TTLS } from './constants';

/* ------------------------------ X4 · QOTD ------------------------------- */

export const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const qotdAddSchema = z.object({
  text: z.string().trim().min(8).max(MAX_QOTD_LENGTH),
  /** Optional UTC day to pin the prompt to; omitted = join the queue. */
  dayKey: dayKeySchema.optional(),
});

/* ------------------------------ X5 · series ----------------------------- */

export const seriesCreateSchema = z.object({
  title: z.string().trim().min(2).max(MAX_SERIES_TITLE),
  description: z.string().trim().max(MAX_SERIES_DESCRIPTION).optional(),
});
export const seriesUpdateSchema = seriesCreateSchema.partial();
export const seriesAddPostSchema = z.object({ postId: z.string().min(1).max(64) });
export const seriesMoveSchema = z.object({
  postId: z.string().min(1).max(64),
  direction: z.enum(['up', 'down']),
});

/* ------------------------------ X8 · expiry ----------------------------- */

export const postTtlSchema = z.enum(POST_TTLS);

export const autoDeleteSchema = z.object({
  months: z.union([z.literal(3), z.literal(6), z.literal(12), z.literal(24)]).nullable(),
});

/* ------------------------------ X9 · notes ------------------------------ */

export const saveNoteSchema = z.object({
  entityType: z.string().min(1).max(24),
  entityId: z.string().min(1).max(64),
  note: z.string().trim().max(MAX_SAVE_NOTE).nullable(),
});

/* ------------------------ X4/X5/X8 · compose payload --------------------- */

/** Fields the composer adds to POST /api/rmharks. */
export const postsPlusComposeFields = {
  ttl: postTtlSchema.optional(),
  seriesId: z.string().max(64).optional(),
  qotdDay: dayKeySchema.optional(),
};

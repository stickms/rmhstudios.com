/**
 * Request shapes for Dunesday cloud sync, shared by the client and the routes.
 *
 * `state` is accepted as opaque JSON with a size cap: the server re-normalises
 * it through `hydrateState`, which is a stricter check than a zod mirror of the
 * same shape would be, and cannot drift from what the page actually stores.
 */

import { z } from 'zod';

export const FEED_ID = /^[A-Za-z0-9_-]{8,32}$/;
export const TOKEN_HEADER = 'x-dunesday-token';

const MAX_STATE_CHARS = 64 * 1024;

export const syncBodySchema = z.object({
  state: z
    .unknown()
    .refine((v) => v !== null && typeof v === 'object', 'state must be an object')
    .refine((v) => JSON.stringify(v).length <= MAX_STATE_CHARS, 'state is too large'),
  timeZone: z.string().min(1).max(64),
});

export const discordSettingsSchema = z.object({
  /** Omit to keep the saved webhook; null or "" to remove it. */
  webhookUrl: z.string().max(500).nullable().optional(),
  daily: z.boolean(),
  progress: z.boolean(),
  name: z.string().max(40).nullable(),
});

export const discordTestSchema = z.object({
  webhookUrl: z.string().max(500).nullable().optional(),
});

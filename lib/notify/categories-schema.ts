/**
 * Notification center v2 — the zod schema for PUT /api/preferences/notifications.
 * Split from `./categories`, which the settings page and the dispatch gateway
 * import, so the settings page stays zod-free.
 */
import { z } from 'zod';

import { NOTIFY_CATEGORIES } from './categories';

const channelSchema = z.object({
  inapp: z.boolean().optional(),
  push: z.boolean().optional(),
  email: z.boolean().optional(),
});

export const notifPrefsSchema = z.object({
  // partialRecord: any subset of categories may be present, unknown keys rejected.
  matrix: z.partialRecord(z.enum(NOTIFY_CATEGORIES), channelSchema).optional(),
  quietStart: z.number().int().min(0).max(1439).nullable().optional(),
  quietEnd: z.number().int().min(0).max(1439).nullable().optional(),
  tz: z.string().max(40).nullable().optional(),
  emailDigest: z.boolean().optional(),
});

export type NotifPrefsInput = z.infer<typeof notifPrefsSchema>;

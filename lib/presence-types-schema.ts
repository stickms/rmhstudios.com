/**
 * Rich presence (§9) — the zod schema for the presence-privacy PUT
 * (settings → privacy). Split from `lib/presence-types.ts`, which the Friends
 * rail and the privacy settings import, so they stay zod-free.
 */
import { z } from 'zod';

import { PRESENCE_VISIBILITIES } from './presence-types';

/** zod for the presence-privacy PUT (settings → privacy). */
export const presencePrivacySchema = z.object({
  presenceVisibility: z.enum(PRESENCE_VISIBILITIES).optional(),
  presenceDetail: z.boolean().optional(),
});

export type PresencePrivacyInput = z.infer<typeof presencePrivacySchema>;

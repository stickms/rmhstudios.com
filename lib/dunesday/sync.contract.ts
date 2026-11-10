/**
 * Contracts for Dunesday cloud sync (redesign audit C1, batch 3). Client-safe.
 * Every call except create carries the owner's edit token in `x-dunesday-token`
 * (pass it through the call's `headers`); a wrong token and a missing plan both
 * answer 404 `That synced plan does not exist.`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  discordSettingsSchema,
  discordTestSchema,
  syncBodySchema,
} from '@/lib/dunesday/sync-schema';
import type { SyncedPlanView } from '@/lib/dunesday/sync.server';

export type { SyncedPlanView };

/** Turn sync on: the public feed id and the secret edit token (201). */
export const createDunesdaySyncApi = endpoint<{
  body: z.infer<typeof syncBodySchema>;
  res: { feedId: string; token: string };
}>()({ method: 'POST', path: '/api/dunesday/sync' });

/** The owner's copy, to restore on another device. */
export const getDunesdaySyncApi = endpoint<{ res: SyncedPlanView }>()({
  method: 'GET',
  path: '/api/dunesday/sync/$feedId',
});

/** Save the plan; `posted` says whether a Discord progress post went out. */
export const saveDunesdaySyncApi = endpoint<{
  body: z.infer<typeof syncBodySchema>;
  res: { ok: true; posted: boolean };
}>()({ method: 'PUT', path: '/api/dunesday/sync/$feedId' });

/** Stop syncing; the feeds stop working. */
export const deleteDunesdaySyncApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/dunesday/sync/$feedId',
});

/** Save the Discord webhook + post preferences. 400 `{ error }` for a bad webhook. */
export const saveDunesdayDiscordApi = endpoint<{
  body: z.infer<typeof discordSettingsSchema>;
  res: SyncedPlanView;
}>()({ method: 'PUT', path: '/api/dunesday/sync/$feedId/discord' });

/** Send a test message. 400 `{ error }` when Discord rejects it. */
export const testDunesdayDiscordApi = endpoint<{
  body: z.infer<typeof discordTestSchema>;
  res: { ok: true };
}>()({ method: 'POST', path: '/api/dunesday/sync/$feedId/discord' });

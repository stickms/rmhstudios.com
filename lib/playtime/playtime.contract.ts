/**
 * Contracts for /api/settings/playtime-privacy (redesign audit C1). Client-safe:
 * types come from the zod schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import type { GrantedDrop } from '@/lib/cards/types';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  dismissPlaytimeNoticeBody,
  playtimeSettings,
  setPlaytimePrivacyBody,
} from '@/lib/playtime/playtime-schema';

type Settings = z.infer<typeof playtimeSettings>;

export const getPlaytimeSettingsApi = endpoint<{ res: Settings }>()({
  method: 'GET',
  path: '/api/settings/playtime-privacy',
});

export const setPlaytimePrivacyApi = endpoint<{
  body: z.infer<typeof setPlaytimePrivacyBody>;
  res: Settings;
}>()({ method: 'PUT', path: '/api/settings/playtime-privacy' });

export const dismissPlaytimeNoticeApi = endpoint<{
  body: z.infer<typeof dismissPlaytimeNoticeBody>;
  res: Settings;
}>()({ method: 'POST', path: '/api/settings/playtime-privacy' });

/**
 * One playtime heartbeat for the title the caller has open (sent with `keepalive`).
 * `drops` lists any trading cards the beat granted.
 */
export const recordPlaytimeBeatApi = endpoint<{
  body: { gameId: string };
  res: { credited: number; drops: GrantedDrop[] };
}>()({ method: 'POST', path: '/api/games/playtime' });

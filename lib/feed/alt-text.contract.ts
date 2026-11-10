/**
 * Contracts for /api/settings/alt-text (redesign audit C1, batch 4).
 * Client-safe: types come from the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { altTextSettingSchema } from '@/lib/feed/alt-text-schema';

type AltTextSetting = z.infer<typeof altTextSettingSchema>;

export const getAltTextSettingApi = endpoint<{ res: AltTextSetting }>()({
  method: 'GET',
  path: '/api/settings/alt-text',
});

export const setAltTextSettingApi = endpoint<{ body: AltTextSetting; res: AltTextSetting }>()({
  method: 'POST',
  path: '/api/settings/alt-text',
});

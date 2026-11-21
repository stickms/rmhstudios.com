/**
 * Contracts for /api/settings/quiet-counts (sprint 04 #14).
 * Client-safe: types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { quietCountsSettingsSchema, quietCountsUpdateSchema } from '@/lib/feed/quiet-counts-schema';

type QuietCountsSettings = z.infer<typeof quietCountsSettingsSchema>;
type QuietCountsUpdate = z.infer<typeof quietCountsUpdateSchema>;

export const getQuietCountsApi = endpoint<{ res: QuietCountsSettings }>()({
  method: 'GET',
  path: '/api/settings/quiet-counts',
});

export const setQuietCountsApi = endpoint<{ body: QuietCountsUpdate; res: QuietCountsSettings }>()({
  method: 'PUT',
  path: '/api/settings/quiet-counts',
});

/**
 * Contracts for /api/settings/play-limits (redesign audit C1, batch 5).
 * Client-safe: the view type comes from the server module by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { playLimitsChangeSchema } from '@/lib/economy/play-limits-schema';
import type { PlayLimitsView } from '@/lib/economy/play-limits.server';

export const getPlayLimitsApi = endpoint<{
  res: PlayLimitsView;
}>()({
  method: 'GET',
  path: '/api/settings/play-limits',
});

/** Tightening applies now; loosening waits 24 hours (the policy is in `applyChange`). */
export const setPlayLimitsApi = endpoint<{
  body: z.infer<typeof playLimitsChangeSchema>;
  res: PlayLimitsView;
}>()({
  method: 'POST',
  path: '/api/settings/play-limits',
});

/**
 * Whether the risk surfaces (`lib/economy/risk-surfaces.ts`) are hidden from this member's menus and search. Says
 * `hidden` and nothing else: the dates stay on the settings panel. Signed out is never hidden.
 */
export const getRiskSurfacesApi = endpoint<{
  res: { hidden: boolean };
}>()({
  method: 'GET',
  path: '/api/settings/play-limits/surfaces',
});

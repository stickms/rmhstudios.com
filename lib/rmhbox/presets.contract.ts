/**
 * Contracts for /api/rmhbox/presets: a host's saved settings per minigame. Client-safe.
 * Failures carry `{ error, code }` (`PresetErrorCode`); read the code with `errorField`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { RmhboxPreset } from '@/lib/rmhbox/presets';
import type { createPresetSchema, updatePresetSchema } from '@/lib/rmhbox/presets-schema';

/** The caller's presets, for one minigame or (without `minigame`) all of them. */
export const listRmhboxPresetsApi = endpoint<{
  query: { minigame?: string | undefined };
  res: { presets: RmhboxPreset[] };
}>()({ method: 'GET', path: '/api/rmhbox/presets' });

/** 201. */
export const createRmhboxPresetApi = endpoint<{
  body: z.infer<typeof createPresetSchema>;
  res: { preset: RmhboxPreset };
}>()({ method: 'POST', path: '/api/rmhbox/presets' });

export const updateRmhboxPresetApi = endpoint<{
  body: z.infer<typeof updatePresetSchema>;
  res: { preset: RmhboxPreset };
}>()({ method: 'PATCH', path: '/api/rmhbox/presets/$id' });

export const deleteRmhboxPresetApi = endpoint<{
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/rmhbox/presets/$id' });

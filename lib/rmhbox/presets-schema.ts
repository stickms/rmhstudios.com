/** Input validation for the RMHBox preset endpoints. Lists and ids are single parameters. */
import { z } from 'zod';
import { PRESET_NAME_MAX, PRESET_VALUES_MAX_BYTES, valuesByteLength } from '@/lib/rmhbox/presets';

const minigameId = z.string().min(1).max(40);
const name = z.string().trim().min(1).max(PRESET_NAME_MAX);

/** Setting values are flat; the minigame's own schema decides which keys survive. */
const values = z
  .record(z.string().max(64), z.union([z.boolean(), z.number(), z.string().max(256)]))
  .refine((v) => Object.keys(v).length <= 64, 'Too many settings')
  .refine((v) => valuesByteLength(v) <= PRESET_VALUES_MAX_BYTES, 'Settings are too large');

export const listPresetsQuerySchema = z.object({ minigame: minigameId.optional() });

export const createPresetSchema = z.object({
  minigameId,
  name,
  values,
  isDefault: z.boolean().optional(),
});

export const updatePresetSchema = z
  .object({
    name: name.optional(),
    values: values.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((b) => b.name !== undefined || b.values !== undefined || b.isDefault !== undefined, 'Nothing to change');

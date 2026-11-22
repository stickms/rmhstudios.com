/**
 * Zod schema for the masks of an occlusion card (s09-03). Imported by the ROUTES (deck routes and the developer API)
 * only; the editor and the client reach the same rules through `occlusion.ts`, which has no zod.
 *
 * The shape is checked here (types and sizes, so a bad body is refused before any work); `checkOcclusion` then
 * applies the bounds, the label rules and the id assignment, and `validateCard` reports its answer as an issue.
 */
import { z } from 'zod';
import { OCCLUSION_LABEL_MAX, OCCLUSION_MAX_MASKS, OCCLUSION_MODES } from '@/lib/study/occlusion';

/** One mask as written: `id` is absent for a mask just drawn (the server gives it the next free one). */
export const occlusionMaskInput = z
  .object({
    id: z.number().int().min(1).max(1_000_000).optional(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
    label: z.string().max(OCCLUSION_LABEL_MAX * 2),
  })
  .strict();

export const occlusionInput = z
  .object({
    mode: z.enum(OCCLUSION_MODES),
    masks: z.array(occlusionMaskInput).min(1).max(OCCLUSION_MAX_MASKS),
  })
  .strict();

/** `null` clears it (a card changed to another kind); absent leaves it. */
export const occlusionShape = {
  occlusion: occlusionInput.nullable().optional(),
};

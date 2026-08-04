/**
 * Request schema for the appearance/comfort preference sync (§13) — the zod half
 * of `./prefs`.
 *
 * It lives apart so `./prefs` can stay zod-free: `Providers.tsx` and
 * `__root.tsx` import that module's constants and DOM appliers on every page, so
 * a zod import there rides the client critical path of the whole site (69.7 KB)
 * for a schema only `/api/preferences/appearance` uses. See the note in
 * `./prefs` before moving anything back.
 */
import { z } from 'zod';
import { DENSITIES, COLOR_VISION_MODES, HEX_RE } from '@/lib/appearance/prefs';

export const appearanceComfortSchema = z.object({
  fontScale: z
    .union([z.literal(875), z.literal(1000), z.literal(1125), z.literal(1250)])
    .nullable()
    .optional(),
  density: z.enum(DENSITIES).nullable().optional(),
  readableFont: z.boolean().optional(),
  customAccent: z.string().regex(HEX_RE).nullable().optional(),
  reduceMotion: z.boolean().optional(),
  glassLevel: z.number().int().min(0).max(4).nullable().optional(),
  colorVision: z.enum(COLOR_VISION_MODES).nullable().optional(),
});

export type AppearanceComfortInput = z.infer<typeof appearanceComfortSchema>;

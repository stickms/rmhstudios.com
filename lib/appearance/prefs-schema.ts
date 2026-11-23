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
import { DENSITIES, COLOR_VISION_MODES, JELLY_MOTION_LEVELS } from '@/lib/appearance/prefs';
import { isFontFor, type FontSlot } from '@/lib/appearance/fonts';

/** A font id valid for `slot` (lib/appearance/fonts.ts); stored as given, defaults and `same` included. */
const fontFor = (slot: FontSlot) =>
  z
    .string()
    .max(32)
    .refine((v) => isFontFor(slot, v), { message: `Unknown ${slot} font` })
    .nullable()
    .optional();

export const appearanceComfortSchema = z.object({
  fontScale: z
    .union([z.literal(875), z.literal(1000), z.literal(1125), z.literal(1250)])
    .nullable()
    .optional(),
  density: z.enum(DENSITIES).nullable().optional(),
  readableFont: z.boolean().optional(),
  colorVision: z.enum(COLOR_VISION_MODES).nullable().optional(),
  jellyMotion: z.enum(JELLY_MOTION_LEVELS).nullable().optional(),
  fontMain: fontFor('main'),
  fontReading: fontFor('reading'),
  fontMono: fontFor('mono'),
});

export type AppearanceComfortInput = z.infer<typeof appearanceComfortSchema>;

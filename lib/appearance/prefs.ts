/**
 * Appearance & accessibility comfort preferences (§13) — client-safe shared
 * constants, zod, and localStorage keys used by the store, the Providers
 * runtime, the settings panel, and the sync API.
 */
import { z } from 'zod';

export const FONT_SCALES = [875, 1000, 1125, 1250] as const;
export type FontScale = (typeof FONT_SCALES)[number];
export const DEFAULT_FONT_SCALE = 1000;

export const DENSITIES = ['cozy', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const appearanceComfortSchema = z.object({
  fontScale: z
    .union([z.literal(875), z.literal(1000), z.literal(1125), z.literal(1250)])
    .nullable()
    .optional(),
  density: z.enum(DENSITIES).nullable().optional(),
  readableFont: z.boolean().optional(),
  customAccent: z.string().regex(HEX_RE).nullable().optional(),
  reduceMotion: z.boolean().optional(),
});

export type AppearanceComfortInput = z.infer<typeof appearanceComfortSchema>;

export const FONT_SCALE_KEY = 'rmh-font-scale';
export const DENSITY_KEY = 'rmh-density';
export const READABLE_FONT_KEY = 'rmh-readable-font';
export const CUSTOM_ACCENT_KEY = 'rmh-custom-accent';
export const REDUCE_MOTION_KEY = 'rmh-reduce-motion';

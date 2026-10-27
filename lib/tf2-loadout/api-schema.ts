/**
 * Request validation for `/api/tf2-loadout/*`. Server routes only — the browser
 * uses `api-types.ts` and never pays for zod.
 */

import { z } from 'zod';
import { MAX_SEED, TF_CLASSES } from './catalog-types';
import { LOADOUT_LIMITS } from './api-types';

export const visibilitySchema = z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']);
export const classSchema = z.enum(TF_CLASSES);

const SLOT_KEY = /^(primary|secondary|melee|building|pda|pda2|action|cosmetic(?:[1-9]|1\d|2[0-4])|taunt[1-8])$/;

const defindex = z.number().int().min(0).max(1_000_000);

const fraction = z.number().min(-2).max(2);

export const entrySchema = z.object({
  item: defindex,
  paint: defindex.optional(),
  effect: defindex.optional(),
  fx: z
    .object({
      x: fraction.optional(),
      y: fraction.optional(),
      z: fraction.optional(),
      s: z.number().min(0.25).max(4).optional(),
    })
    .optional(),
  style: z.number().int().min(0).max(30).optional(),
  kit: defindex.optional(),
  wear: z.number().int().min(1).max(5).optional(),
  seed: z.number().int().min(0).max(MAX_SEED).optional(),
});

export const slotsSchema = z
  .record(z.string().regex(SLOT_KEY), entrySchema)
  .refine((s) => Object.keys(s).length <= 60, 'too many slots');

export const createLoadoutSchema = z.object({
  title: z.string().trim().min(1).max(LOADOUT_LIMITS.maxTitle),
  description: z.string().max(LOADOUT_LIMITS.maxDescription).default(''),
  tfClass: classSchema,
  slots: slotsSchema,
  visibility: visibilitySchema.default('PRIVATE'),
});

export const updateLoadoutSchema = z.object({
  title: z.string().trim().min(1).max(LOADOUT_LIMITS.maxTitle).optional(),
  description: z.string().max(LOADOUT_LIMITS.maxDescription).optional(),
  tfClass: classSchema.optional(),
  slots: slotsSchema.optional(),
  visibility: visibilitySchema.optional(),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['new', 'top']).default('top'),
  tfClass: classSchema.optional(),
  cursor: z.string().max(40).optional(),
  mine: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

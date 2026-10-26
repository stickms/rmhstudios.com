/**
 * Request validation for `/api/tf2-hud/*`. Server routes only — the browser
 * uses `api-types.ts` and never pays for zod.
 */

import { z } from 'zod';
import { HUD_LIMITS } from './api-types';

const sha1 = z.string().regex(/^[0-9a-f]{40}$/, 'bad hash');

export const visibilitySchema = z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']);

export const manifestEntrySchema = z
  .object({
    path: z.string().min(1).max(240),
    sha1: sha1.optional(),
    size: z.number().int().min(0).max(HUD_LIMITS.maxBlobBytes).optional(),
    deleted: z.literal(true).optional(),
  })
  .refine((e) => Boolean(e.deleted) !== Boolean(e.sha1), 'entry must be a file or a deletion');

export const manifestSchema = z.array(manifestEntrySchema).max(HUD_LIMITS.maxFiles);

const tags = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(24)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u),
  )
  .max(HUD_LIMITS.maxTags);

export const createHudSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(2000).default(''),
  tags: tags.default([]),
  visibility: visibilitySchema.default('PRIVATE'),
  manifest: manifestSchema,
  baseCommit: z.string().max(64),
  forkOfId: z.string().max(40).optional(),
  message: z.string().max(200).optional(),
});

export const updateHudSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(2000).optional(),
  tags: tags.optional(),
  visibility: visibilitySchema.optional(),
  manifest: manifestSchema.optional(),
  message: z.string().max(200).optional(),
  autosave: z.boolean().optional(),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['new', 'top', 'forks']).default('top'),
  tag: z.string().trim().toLowerCase().max(24).optional(),
  cursor: z.string().max(40).optional(),
  mine: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

export const blobCheckSchema = z.object({ hashes: z.array(sha1).min(1).max(500) });

export const fileQuerySchema = z.object({
  path: z.string().min(1).max(240),
  v: z.coerce.number().int().min(1).optional(),
});

export const sha1Param = sha1;

/**
 * The zod input schemas for the developer-key routes (`/api/developer/keys`).
 * Split out of the route files so the client contract can name their types.
 */
import { z } from 'zod';

export const createKeyBody = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  /** `rmh_test_` sandbox key (fixtures for reads, no-op writes). */
  testMode: z.boolean().optional(),
});

export const patchKeyBody = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  rotate: z.boolean().optional(),
});

/**
 * RMHVibe key-value store — request schemas. Server-imported only (client code must
 * not ship zod); the contract in `vibe-kv.contract.ts` takes its types from here.
 */

import { z } from 'zod';
import { KEY_RE } from '@/lib/rmhvibe/bridge';

const keySchema = z.string().regex(KEY_RE);
const scopeSchema = z.enum(['page', 'user']);

export const vibeKvReadQuerySchema = z
  .object({
    key: keySchema.optional(),
    prefix: z.string().max(64).optional(),
    scope: scopeSchema,
    order: z.enum(['key', 'value-desc']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  // One of key / prefix, never both: a point read or a listing.
  .refine((q) => (q.key === undefined) !== (q.prefix === undefined));

export const vibeKvWriteBodySchema = z
  .object({
    op: z.enum(['set', 'incr']),
    key: keySchema,
    scope: scopeSchema,
    value: z.unknown().optional(),
    by: z.number().int().min(-1000).max(1000).optional(),
    oncePerUser: z.boolean().optional(),
  })
  .refine((b) => (b.op === 'set' ? b.value !== undefined : b.by !== undefined));

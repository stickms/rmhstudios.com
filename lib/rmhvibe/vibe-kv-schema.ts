/**
 * RMHVibe key-value store — request schemas. Server-imported only (client code must
 * not ship zod); the contract in `vibe-kv.contract.ts` takes its types from here.
 */

import { z } from 'zod';
import { KEY_RE } from '@/lib/rmhvibe/bridge';

/**
 * True when a value holds text Postgres `jsonb` cannot store: a NUL character, or a lone
 * UTF-16 surrogate (neither can round-trip through jsonb, so they would 500 on the insert).
 * Walks the DECODED value (strings and object keys), so the literal six characters `\u0000`
 * inside a string are fine. Iterative, so a deeply nested value cannot overflow the stack.
 */
export function hasUnstorableText(value: unknown): boolean {
  const bad = (t: string) => t.includes('\u0000') || !t.isWellFormed();
  const stack: unknown[] = [value];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === 'string') {
      if (bad(v)) return true;
    } else if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (bad(k)) return true;
        stack.push(x);
      }
    }
  }
  return false;
}

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
    value: z
      .unknown()
      .optional()
      .refine((v) => !hasUnstorableText(v)),
    by: z.number().int().min(-1000).max(1000).optional(),
    oncePerUser: z.boolean().optional(),
  })
  .refine((b) => (b.op === 'set' ? b.value !== undefined : b.by !== undefined));

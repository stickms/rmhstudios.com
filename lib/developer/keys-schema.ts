/**
 * The zod input schemas for the developer-key routes (`/api/developer/keys`).
 * Split out of the route files so the client contract can name their types.
 */
import { z } from 'zod';
import { MAX_ALLOWED_ENTRIES, parseAllowlistLines } from '@/lib/api/ip-allowlist';

/**
 * A key's allowed addresses: IPv4/IPv6 addresses or CIDR ranges, at most 20.
 * Empty means any address. Validated with the same parser the form uses, then
 * trimmed and de-duplicated, so the stored list is exactly what is enforced.
 */
export const allowedCidrsField = z
  .array(z.string().max(64))
  .max(MAX_ALLOWED_ENTRIES * 5)
  .superRefine((lines, ctx) => {
    for (const e of parseAllowlistLines(lines).errors) {
      ctx.addIssue({
        code: 'custom',
        message:
          e.code === 'too_many'
            ? `At most ${MAX_ALLOWED_ENTRIES} addresses are allowed.`
            : e.code === 'open_range'
              ? 'A range covering every address is not a restriction; leave the list empty instead.'
              : e.code === 'prefix_out_of_range'
                ? `Prefix length must be between /${e.min} and /${e.max}.`
                : `"${e.value}" is not an IPv4 or IPv6 address or range.`,
        path: [e.line - 1],
      });
    }
  })
  .transform((lines) => parseAllowlistLines(lines).entries);

/** Requests per minute for one key; the tier's maximum is checked where the tier is known. */
export const rateLimitPerMinuteField = z.number().int().min(1).max(100_000);

export const createKeyBody = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  /** `rmh_test_` sandbox key (fixtures for reads, no-op writes). */
  testMode: z.boolean().optional(),
  allowedCidrs: allowedCidrsField.optional(),
  /** Omit for the tier's limit. */
  rateLimitPerMinute: rateLimitPerMinuteField.nullable().optional(),
});

export const patchKeyBody = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  rotate: z.boolean().optional(),
  /** `[]` lifts the restriction. */
  allowedCidrs: allowedCidrsField.optional(),
  /** `null` returns to the tier's limit. */
  rateLimitPerMinute: rateLimitPerMinuteField.nullable().optional(),
});

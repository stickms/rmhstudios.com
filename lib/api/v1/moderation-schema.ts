/**
 * Zod schemas for `/api/v1/communities/{slug}/modqueue*` and `/sanctions*` (s10-13). Pure (no server imports) so
 * the limits are testable on their own. Request fields are snake_case, like the other v1 write bodies; no field
 * names a moderator: the moderator is always the key owner.
 */
import { z } from 'zod';
import { SANCTION_DURATIONS, SANCTION_KINDS, SANCTION_REASON_MAX, isDurationAllowed } from '@/lib/communities/bans';
import type { SanctionDuration, SanctionKind } from '@/lib/communities/bans';
import { communityPath } from '@/lib/api/v1/communities-schema';

export const MODERATION_PAGE_MAX = 50;
export const MODERATION_PAGE_DEFAULT = 20;
/** Decisions and sanctions one key may make an hour, on top of the write class. */
export const DECISIONS_PER_HOUR = 120;
export const SANCTIONS_PER_HOUR = 30;
/** The duration a sanction gets when the request names none. */
export const DEFAULT_DURATION: Record<SanctionKind, SanctionDuration> = { timeout: '1d', ban: '7d' };

const ID_MAX = 64;
const empty = (v: unknown) => (v === '' || v === null ? undefined : v);
const optionalText = (max: number) => z.preprocess(empty, z.string().max(max).optional());
const pageLimit = z.preprocess(
  empty,
  z.coerce.number().int().min(1).max(MODERATION_PAGE_MAX).default(MODERATION_PAGE_DEFAULT),
);

export { communityPath };

export const itemPath = communityPath.extend({ itemId: z.string().min(1).max(ID_MAX) });
export const sanctionPath = communityPath.extend({ id: z.string().min(1).max(ID_MAX) });

export const modqueueQuery = z.object({
  view: z.preprocess(empty, z.enum(['pending', 'log']).default('pending')),
  limit: pageLimit,
  cursor: optionalText(ID_MAX),
});

export const decisionBody = z.object({
  decision: z.enum(['approve', 'remove']),
  rule_id: z.string().min(1).max(ID_MAX).optional(),
  message: z.string().trim().max(1000).optional(),
});

export const sanctionsQuery = z.object({
  active: z.preprocess(empty, z.enum(['true', 'false']).default('true')),
  limit: pageLimit,
  cursor: optionalText(ID_MAX),
});

export const createSanctionApiBody = z
  .object({
    handle: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .transform((h) => h.replace(/^@/, ''))
      .pipe(z.string().min(1, 'A handle is required.')),
    kind: z.enum(SANCTION_KINDS),
    duration: z.enum(SANCTION_DURATIONS).optional(),
    rule_id: z.string().min(1).max(ID_MAX).optional(),
    reason: z.string().trim().max(SANCTION_REASON_MAX).optional(),
  })
  .refine((b) => b.duration === undefined || isDurationAllowed(b.kind, b.duration), {
    message: 'That duration is not available for this kind.',
    path: ['duration'],
  });

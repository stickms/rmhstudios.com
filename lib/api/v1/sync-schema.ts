/** Zod schema for `GET /api/v1/me/deleted`. Pure; a list is never a repeated parameter and a blank one is absent. */
import { z } from 'zod';
import { TOMBSTONE_KINDS, TOMBSTONE_PAGE_DEFAULT, TOMBSTONE_PAGE_MAX } from '@/lib/sync/tombstones';

const blankIsAbsent = (v: unknown) => (v === '' || v === null ? undefined : v);

/** `?since=` on a list: an ISO 8601 instant, blank reads as absent. */
export const sinceParam = z.preprocess(
  blankIsAbsent,
  z
    .string()
    .max(40)
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Not an ISO 8601 date and time.')
    .optional(),
);

export const sinceQuery = z.object({ since: sinceParam });

export const deletedQuery = z.object({
  kind: z.enum(TOMBSTONE_KINDS),
  since: sinceParam,
  cursor: z.preprocess(blankIsAbsent, z.string().max(200).optional()),
  limit: z.preprocess(
    blankIsAbsent,
    z.coerce.number().int().min(1).max(TOMBSTONE_PAGE_MAX).default(TOMBSTONE_PAGE_DEFAULT),
  ),
});
export type DeletedQuery = z.infer<typeof deletedQuery>;

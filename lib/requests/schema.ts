/**
 * Wire schemas and DTOs for the public request board (F22). Client-safe.
 */

import { z } from 'zod';
import {
  OFFICIAL_NOTE_MAX,
  REQUEST_BODY_MAX,
  REQUEST_BODY_MIN,
  REQUEST_SORTS,
  REQUEST_STATUSES,
  REQUEST_TITLE_MAX,
  REQUEST_TITLE_MIN,
  type RequestSort,
  type RequestStatus,
} from '@/lib/requests/status';

export const requestCreateSchema = z.object({
  title: z.string().trim().min(REQUEST_TITLE_MIN).max(REQUEST_TITLE_MAX),
  body: z.string().trim().min(REQUEST_BODY_MIN).max(REQUEST_BODY_MAX),
});
export type RequestCreateInput = z.infer<typeof requestCreateSchema>;

/**
 * The admin-side update. `officialNote` is optional at the schema level and
 * *conditionally* required at the service level — zod cannot see the current
 * status of the row being updated, and a `superRefine` here would only cover
 * the case where status and note arrive together.
 */
export const requestUpdateSchema = z
  .object({
    status: z.enum(REQUEST_STATUSES).optional(),
    officialNote: z.string().trim().max(OFFICIAL_NOTE_MAX).nullable().optional(),
    /** Set to merge this request into another; `null` un-merges it. */
    mergedIntoId: z.string().cuid().nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.officialNote !== undefined || v.mergedIntoId !== undefined, {
    message: 'Nothing to update',
  });
export type RequestUpdateInput = z.infer<typeof requestUpdateSchema>;

export const requestListQuerySchema = z.object({
  status: z.enum(REQUEST_STATUSES).optional(),
  sort: z.enum(REQUEST_SORTS).default('top'),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type RequestListQuery = z.infer<typeof requestListQuerySchema>;

/** A request as every board endpoint returns it. */
export interface FeatureRequestDTO {
  id: string;
  title: string;
  body: string;
  status: RequestStatus;
  officialNote: string | null;
  mergedIntoId: string | null;
  /** Title of the merge target, so a duplicate can link to the live thread. */
  mergedIntoTitle: string | null;
  voteCount: number;
  createdAt: string;
  /** Whether the *viewer* has voted. `false` for signed-out readers. */
  hasVoted: boolean;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  } | null;
}

export interface RequestBoardPage {
  requests: FeatureRequestDTO[];
  /** Opaque cursor for the next page, or `null` at the end. */
  nextCursor: string | null;
  /** Per-status totals, so the filter chips can show counts without a refetch. */
  counts: Record<RequestStatus, number>;
}

export const DEFAULT_REQUEST_SORT: RequestSort = 'top';

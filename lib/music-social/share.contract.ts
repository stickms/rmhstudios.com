/**
 * Contracts for sharing an RMH Music result (Phase 6, plan 1.4). Client-safe: types come from the
 * zod schemas by `import type`, so this file ships no zod. Beside `social.contract.ts`, outside
 * `lib/rmhmusic`, so a site page could import it without pulling the app's code onto the site sheet.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  createShareBody,
  shareListRes,
  shareSummarySchema,
  stopShareRes,
} from '@/lib/rmhmusic/learn/social/share-schema';

export type ShareSummary =
  z.infer<
    typeof shareSummarySchema
  >;
export type ShareList =
  z.infer<
    typeof shareListRes
  >;
export type CreateShareInput =
  z.input<
    typeof createShareBody
  >;

/** Create a link to a scored Daily run or a song best (or get back the live one already made). */
export const createShareApi =
  endpoint<{
    body: CreateShareInput;
    res: ShareSummary;
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhmusic/share',
    },
  );

/** The learner's live links, newest first. */
export const listSharesApi =
  endpoint<{
    res: ShareList;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhmusic/share',
    },
  );

/** Stop every live link of the learner's. */
export const stopAllSharesApi =
  endpoint<{
    res: z.infer<
      typeof stopShareRes
    >;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/rmhmusic/share',
    },
  );

/** Stop one link (the learner's own; another learner's id changes nothing). */
export const stopShareApi =
  endpoint<{
    params: {
      id: string;
    };
    res: z.infer<
      typeof stopShareRes
    >;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/rmhmusic/share/$id',
    },
  );

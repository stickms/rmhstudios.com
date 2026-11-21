/**
 * Contracts for library reader sync. Client-safe: types only, no zod at runtime.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  MarkRecord,
  PlaceRecord,
} from '@/lib/library/reader-sync';
import type { putMarksBody } from '@/lib/library/reader-sync-schema';

/** A book's synced place and marks (tombstones from the last 30 days included). */
export interface ReaderMarksRes {
  place: PlaceRecord | null;
  marks: MarkRecord[];
  /** Ids of new marks the caps turned away (never set by a GET). */
  rejected: string[];
}

/** One book on the Continue reading row. */
export interface ContinueBook {
  slug: string;
  title: string;
  coverUrl:
    | string
    | null;
  hue: number;
  page: number;
  pages: number;
  /** 0 to 100. */
  percent: number;
  updatedAt: number;
}

export const getReaderMarksApi =
  endpoint<{
    res: ReaderMarksRes;
  }>()(
    {
      method:
        'GET',
      path: '/api/library/$slug/marks',
    },
  );

export const putReaderMarksApi =
  endpoint<{
    body: z.infer<
      typeof putMarksBody
    >;
    res: ReaderMarksRes;
  }>()(
    {
      method:
        'PUT',
      path: '/api/library/$slug/marks',
    },
  );

export const deleteReaderMarksApi =
  endpoint<{
    res: {
      ok: true;
      removed: number;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/library/$slug/marks',
    },
  );

export const continueReadingApi =
  endpoint<{
    res: {
      books: ContinueBook[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/library/continue',
    },
  );

/**
 * Contracts for /api/slice-it/packs (redesign audit C1). Client-safe: request
 * types come from the zod schemas in `packs.ts` by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { LibrarySong } from '@features/slice-it/engine/library-filters';
import type {
  PackCreateZ,
  PackItemsZ,
  PackListQueryZ,
  PackSummary,
  PackUpdateZ,
} from '@features/slice-it/engine/packs';

export interface PackDetail {
  pack: PackSummary;
  songs: LibrarySong[];
}

export const listPacksApi =
  endpoint<{
    query: z.infer<
      typeof PackListQueryZ
    >;
    res: {
      packs: PackSummary[];
      nextCursor:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/packs',
    },
  );

export const createPackApi =
  endpoint<{
    body: z.infer<
      typeof PackCreateZ
    >;
    res: {
      pack: PackSummary;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/slice-it/packs',
    },
  );

/** Members in pack order. A pack you cannot see is a 404. */
export const getPackApi =
  endpoint<{
    res: PackDetail;
  }>()(
    {
      method:
        'GET',
      path: '/api/slice-it/packs/$id',
    },
  );

export const updatePackApi =
  endpoint<{
    body: z.infer<
      typeof PackUpdateZ
    >;
    res: {
      pack: PackSummary;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/slice-it/packs/$id',
    },
  );

export const deletePackApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/slice-it/packs/$id',
    },
  );

/** `songIds` is the resulting order; `skipped` counts songs the caller may not see. */
export const patchPackItemsApi =
  endpoint<{
    body: z.infer<
      typeof PackItemsZ
    >;
    res: {
      success: true;
      added: number;
      songIds: string[];
      skipped: number;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/slice-it/packs/$id/items',
    },
  );

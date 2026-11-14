/**
 * Contracts for /api/search/saved (redesign audit C1, batch 3). Client-safe:
 * request types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  SavedSearchView,
  savedSearchCreateSchema,
  savedSearchUpdateSchema,
} from '@/lib/search/saved';

export const listSavedSearchesApi =
  endpoint<{
    res: {
      saved: SavedSearchView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/search/saved',
    },
  );

/** 400 `{ error }` past the saved-search limit. */
export const createSavedSearchApi =
  endpoint<{
    body: z.infer<
      typeof savedSearchCreateSchema
    >;
    res: {
      saved: SavedSearchView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/search/saved',
    },
  );

/** Toggle new-result alerts; `alerts` is required (400 without it). */
export const updateSavedSearchApi =
  endpoint<{
    body: z.infer<
      typeof savedSearchUpdateSchema
    >;
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/search/saved/$id',
    },
  );

export const deleteSavedSearchApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/search/saved/$id',
    },
  );

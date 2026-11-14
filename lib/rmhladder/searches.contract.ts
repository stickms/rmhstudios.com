/** Contracts for /api/rmhladder/searches (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  savedSearchFilters,
  saveSearchBody,
} from '@/lib/rmhladder/searches-schema';

export type SavedSearchFilters =
  z.infer<
    typeof savedSearchFilters
  >;

export interface SavedSearchRow {
  id: string;
  userId: string;
  name: string;
  filters: unknown;
  alertsOn: boolean;
  createdAt: string;
  updatedAt: string;
}

export const listSavedSearchesApi =
  endpoint<{
    res: SavedSearchRow[];
  }>()(
    {
      method:
        'GET',
      path: '/api/rmhladder/searches',
    },
  );

/** Create a saved search, or update one when `id` is given (404 when it is not yours). */
export const saveSearchApi =
  endpoint<{
    body: z.infer<
      typeof saveSearchBody
    >;
    res: SavedSearchRow;
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhladder/searches',
    },
  );

export const deleteSavedSearchApi =
  endpoint<{
    query: {
      id: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/rmhladder/searches',
    },
  );

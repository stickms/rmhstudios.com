/**
 * Contracts for the /api/library/collection* calls (redesign audit C1, batches 6
 * and 22.4). The create / rename / add-book / remove-book writes read their bodies
 * leniently with bespoke messages, so their routes keep `defineHandler` and parse
 * by hand; the contract still types the client call. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { CollectionView } from '@/lib/library/collections';

/** Every collection the viewer may see, with a per-row `canEdit`. */
export const listLibraryCollectionsApi =
  endpoint<{
    res: {
      collections: CollectionView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/library/collections',
    },
  );

/** Owner or admin only; the books are not deleted. */
export const deleteLibraryCollectionApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/library/collection/$id',
    },
  );

/** Generate an AI cover (a paid image generation, rate limited). */
export const generateLibraryCollectionCoverApi =
  endpoint<{
    res: {
      ok: true;
      coverUrl: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/library/collection/$id/cover',
    },
  );

/** Create a collection owned by the signed-in user. */
export const createLibraryCollectionApi =
  endpoint<{
    body: {
      title: string;
      description: string;
    };
    res: Record<
      string,
      unknown
    >;
  }>()(
    {
      method:
        'POST',
      path: '/api/library/collections',
    },
  );

/** Rename / re-describe a collection (owner or admin). */
export const updateLibraryCollectionApi =
  endpoint<{
    body: {
      title?: string;
      description?: string;
    };
    res: Record<
      string,
      unknown
    >;
  }>()(
    {
      method:
        'PATCH',
      path: '/api/library/collection/$id',
    },
  );

export const addLibraryCollectionBookApi =
  endpoint<{
    body: {
      bookSlug: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/library/collection/$id/items',
    },
  );

export const removeLibraryCollectionBookApi =
  endpoint<{
    body: {
      bookSlug: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/library/collection/$id/items',
    },
  );

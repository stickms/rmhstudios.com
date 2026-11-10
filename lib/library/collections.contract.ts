/**
 * Contracts for the bodyless /api/library/collection* calls (redesign audit C1,
 * batch 6). The create / rename / add-book / remove-book writes read their bodies
 * leniently with bespoke messages and stay raw fetches. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { CollectionView } from '@/lib/library/collections';

/** Every collection the viewer may see, with a per-row `canEdit`. */
export const listLibraryCollectionsApi = endpoint<{ res: { collections: CollectionView[] } }>()({
  method: 'GET',
  path: '/api/library/collections',
});

/** Owner or admin only; the books are not deleted. */
export const deleteLibraryCollectionApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/library/collection/$id',
});

/** Generate an AI cover (a paid image generation, rate limited). */
export const generateLibraryCollectionCoverApi = endpoint<{
  res: { ok: true; coverUrl: string };
}>()({ method: 'POST', path: '/api/library/collection/$id/cover' });

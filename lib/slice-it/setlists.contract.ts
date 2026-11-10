/**
 * Contracts for /api/slice-it/setlists (redesign audit C1). Client-safe: request
 * types come from the zod schemas and response types from `setlist.server`,
 * both by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ResolvedSetlist, SetlistSummary } from '@/lib/slice-it/setlist.server';
import type { SetlistBodyZ, SetlistPatchZ } from '@/lib/slice-it/setlist-schema';

export interface SetlistIndex {
  mine: SetlistSummary[];
  public: SetlistSummary[];
  liked: { id: string; songCount: number } | null;
}

export const listSetlistsApi = endpoint<{ res: SetlistIndex }>()({
  method: 'GET',
  path: '/api/slice-it/setlists',
});

/** 201. */
export const createSetlistApi = endpoint<{
  body: z.infer<typeof SetlistBodyZ>;
  res: ResolvedSetlist;
}>()({ method: 'POST', path: '/api/slice-it/setlists' });

/** `$id` may be the virtual liked-songs id (signed-in only). */
export const getSetlistApi = endpoint<{ res: ResolvedSetlist }>()({
  method: 'GET',
  path: '/api/slice-it/setlists/$id',
});

export const updateSetlistApi = endpoint<{
  body: z.infer<typeof SetlistPatchZ>;
  res: ResolvedSetlist;
}>()({ method: 'PATCH', path: '/api/slice-it/setlists/$id' });

export const deleteSetlistApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/slice-it/setlists/$id',
});

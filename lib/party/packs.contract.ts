/** Contracts for /api/rmhbox/packs list and create (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { PackView } from '@/lib/party/packs';
import type { createPackSchema } from '@/lib/party/packs-schema';

export interface PackLists {
  featured: PackView[];
  recent: PackView[];
  mine: PackView[];
}

/** Featured shelf, newest community packs, the caller's own. */
export const listPacksApi = endpoint<{ res: PackLists }>()({
  method: 'GET',
  path: '/api/rmhbox/packs',
});

/** Author a prompt pack; the 201 carries its share code. */
export const createPackApi = endpoint<{
  body: z.infer<typeof createPackSchema>;
  res: { pack: PackView };
}>()({ method: 'POST', path: '/api/rmhbox/packs' });

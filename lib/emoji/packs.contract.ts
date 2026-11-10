/**
 * Contracts for /api/emoji-packs (redesign audit C1, batch 4). Client-safe:
 * request types come from the zod schemas by `import type`. Failures carry the
 * server's `{ error }` text as the `HttpError` message; creating or filling a
 * pack without the `sticker-packs` feature is a 402.
 *
 * Not covered on purpose: `/api/emoji-packs/$slug/upload` (multipart).
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { InstalledPack, PackItem, PackSummary } from '@/lib/emoji/packs';
import type { addItemSchema, browsePacksQuery, createPackSchema } from '@/lib/emoji/packs-schema';

export const browsePacksApi = endpoint<{
  query: z.infer<typeof browsePacksQuery>;
  res: { packs: PackSummary[] };
}>()({ method: 'GET', path: '/api/emoji-packs' });

/** 201. */
export const createPackApi = endpoint<{
  body: z.infer<typeof createPackSchema>;
  res: { pack: PackSummary };
}>()({ method: 'POST', path: '/api/emoji-packs' });

/** The viewer's installed packs (with items) and the packs they own. */
export const installedPacksApi = endpoint<{
  res: { installed: InstalledPack[]; owned: PackSummary[] };
}>()({ method: 'GET', path: '/api/emoji-packs/installed' });

export const subscribePackApi = endpoint<{ res: { ok: true } }>()({
  method: 'POST',
  path: '/api/emoji-packs/$slug/subscribe',
});

export const unsubscribePackApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/emoji-packs/$slug/subscribe',
});

/** 201. */
export const addPackItemApi = endpoint<{
  body: z.infer<typeof addItemSchema>;
  res: { item: PackItem };
}>()({ method: 'POST', path: '/api/emoji-packs/$slug/items' });

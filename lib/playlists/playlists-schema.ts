/**
 * Zod schemas for the /api/playlists routes. Imported by the ROUTES only; the
 * client reaches the same types through `playlists.contract.ts` with
 * `import type`, so zod never ships to the browser for these endpoints.
 */
import { z } from 'zod';
import { HANDLE_REGEX } from '@/lib/handle';

export const createPlaylistBody = z.object({
  name: z.string().min(1).max(100),
  // Every playlist is a video playlist; the field is accepted for older clients.
  kind: z.literal('video').optional(),
});

export const renamePlaylistBody = z.object({
  name: z.string().min(1).max(100),
});

/** Accepts "@name" or "name"; normalises to the stored lowercase handle. */
export const addCollaboratorBody = z.object({
  handle: z
    .string()
    .trim()
    .max(21)
    .transform((h) => h.replace(/^@/, '').toLowerCase())
    .pipe(z.string().regex(HANDLE_REGEX, 'Invalid handle')),
});

export const addPlaylistItemBody = z.object({
  externalId: z.string().min(1).max(255),
  title: z.string().min(1).max(300),
  subtitle: z.string().max(300).optional().nullable(),
  thumbnail: z.string().max(500).optional().nullable(),
  url: z.string().max(1000).optional().nullable(),
  durationMs: z.number().int().nonnegative().optional().nullable(),
});

/** The most items one bulk add takes (the room queue saved as a playlist). */
export const MAX_BULK_ITEMS = 200;

export const addPlaylistItemsBulkBody = z.object({
  items: z.array(addPlaylistItemBody).min(1).max(MAX_BULK_ITEMS),
});

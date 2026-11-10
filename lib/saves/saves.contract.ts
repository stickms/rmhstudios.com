/**
 * Contracts for /api/saves (redesign audit C1, batch 4). Client-safe: request
 * types come from the zod schemas by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { saveNoteSchema } from '@/lib/posts-plus/schema';
import type {
  folderCreateSchema,
  HydratedSave,
  SaveFolderView,
  saveEntitySchema,
  saveListQuery,
} from '@/lib/saves/types';

export const listSavesApi = endpoint<{
  query: z.infer<typeof saveListQuery>;
  res: { items: HydratedSave[]; nextCursor: string | null; folders: SaveFolderView[] };
}>()({ method: 'GET', path: '/api/saves' });

/** Idempotent. 404 when the item or the folder is gone. */
export const saveItemApi = endpoint<{
  body: z.infer<typeof saveEntitySchema>;
  res: { saved: true };
}>()({ method: 'POST', path: '/api/saves' });

/** Idempotent. */
export const unsaveItemApi = endpoint<{
  body: z.infer<typeof saveEntitySchema>;
  res: { saved: false };
}>()({ method: 'DELETE', path: '/api/saves' });

export const listSaveFoldersApi = endpoint<{ res: { folders: SaveFolderView[] } }>()({
  method: 'GET',
  path: '/api/saves/folders',
});

export const createSaveFolderApi = endpoint<{
  body: z.infer<typeof folderCreateSchema>;
  res: { folder: SaveFolderView };
}>()({ method: 'POST', path: '/api/saves/folders' });

/** The private note on one save; `null` clears it. 404 when the item is not saved. */
export const setSaveNoteApi = endpoint<{
  body: z.infer<typeof saveNoteSchema>;
  res: { note: string | null };
}>()({ method: 'PUT', path: '/api/saves/note' });

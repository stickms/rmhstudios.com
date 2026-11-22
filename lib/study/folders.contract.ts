/** Contracts for a member's deck folders. Client-safe: request types by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { DeckFolderSummary } from '@/lib/study/folders';
import type { createFolderBody, moveDeckBody, updateFolderBody } from '@/lib/study/folders-schema';

export const listFoldersApi = endpoint<{ res: { folders: DeckFolderSummary[] } }>()({
  method: 'GET',
  path: '/api/study/folders',
});

/** 201. 400 `Too many folders` past 30, 409 `Name taken` for a name already used (case ignored). */
export const createFolderApi = endpoint<{
  body: z.infer<typeof createFolderBody>;
  res: { success: true; folder: DeckFolderSummary };
}>()({ method: 'POST', path: '/api/study/folders' });

/** Rename, collapse or expand, or move one step. 404 for a folder that is not yours. */
export const updateFolderApi = endpoint<{
  body: z.infer<typeof updateFolderBody>;
  res: { success: true };
}>()({ method: 'PATCH', path: '/api/study/folders/$id' });

/** The folder goes; its decks move to "No folder". */
export const deleteFolderApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/study/folders/$id',
});

/** Put your deck in one of your folders, or `null` for no folder. 404 for a foreign deck or folder. */
export const moveDeckApi = endpoint<{
  body: z.infer<typeof moveDeckBody>;
  res: { success: true };
}>()({ method: 'PUT', path: '/api/study/decks/$id/folder' });

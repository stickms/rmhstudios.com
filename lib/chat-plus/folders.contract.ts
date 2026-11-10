/** Contracts for chat folders (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  FolderView,
  folderItemSchema,
  folderNameSchema,
} from '@/lib/chat-plus/folders.server';

export const listChatFoldersApi = endpoint<{ res: { folders: FolderView[] } }>()({
  method: 'GET',
  path: '/api/chat-folders',
});

export const createChatFolderApi = endpoint<{
  body: z.infer<typeof folderNameSchema>;
  res: { folder: FolderView };
}>()({ method: 'POST', path: '/api/chat-folders' });

/** Put a chat in, or take it out of, a folder. */
export const setChatFolderMemberApi = endpoint<{
  body: z.infer<typeof folderItemSchema>;
  res: { scopeKey: string; member: boolean };
}>()({ method: 'PUT', path: '/api/chat-folders/$id/items' });

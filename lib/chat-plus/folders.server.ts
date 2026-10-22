/**
 * M1 — chat folders. Server-only.
 *
 * A folder is a named set of scope keys (`dm:<id>` / `group:<id>`) belonging to
 * one user. The list routes filter by it with a single `id IN (…)`; folder
 * membership is never copied onto the conversation rows.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { getChatAccess } from '@/lib/chat-plus/access.server';
import {
  FOLDER_NAME_MAX,
  MAX_FOLDERS,
  MAX_FOLDER_CHATS,
  parseScopeKey,
  scopeKeyOf,
} from '@/lib/chat-plus/types';
import { chatRefSchema } from '@/lib/chat-plus/types-schema';

export const folderNameSchema = z.object({ name: z.string().trim().min(1).max(FOLDER_NAME_MAX) });
export const folderItemSchema = z.object({ chat: chatRefSchema, member: z.boolean() });

export interface FolderView {
  id: string;
  name: string;
  position: number;
  scopeKeys: string[];
}

export async function listFolders(userId: string): Promise<FolderView[]> {
  const folders = await prisma.chatFolder.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    take: MAX_FOLDERS,
    select: {
      id: true,
      name: true,
      position: true,
      items: { select: { scopeKey: true }, take: MAX_FOLDER_CHATS },
    },
  });
  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    position: f.position,
    scopeKeys: f.items.map((i) => i.scopeKey),
  }));
}

export type FolderOpResult<T = FolderView> =
  { ok: true; value: T } | { ok: false; status: number; error: string };

export async function createFolder(userId: string, name: string): Promise<FolderOpResult> {
  const count = await prisma.chatFolder.count({ where: { userId } });
  if (count >= MAX_FOLDERS) {
    return { ok: false, status: 409, error: `You can have up to ${MAX_FOLDERS} folders` };
  }
  const f = await prisma.chatFolder.create({
    data: { userId, name, position: count },
    select: { id: true, name: true, position: true },
  });
  return { ok: true, value: { ...f, scopeKeys: [] } };
}

export async function renameFolder(
  userId: string,
  id: string,
  name: string,
): Promise<FolderOpResult<{ id: string; name: string }>> {
  const res = await prisma.chatFolder.updateMany({ where: { id, userId }, data: { name } });
  return res.count
    ? { ok: true, value: { id, name } }
    : { ok: false, status: 404, error: 'Folder not found' };
}

export async function deleteFolder(userId: string, id: string): Promise<boolean> {
  const res = await prisma.chatFolder.deleteMany({ where: { id, userId } });
  return res.count > 0;
}

/** Put a chat in / take it out of a folder. The viewer must belong to the chat. */
export async function setFolderMembership(
  userId: string,
  folderId: string,
  chat: { kind: 'dm' | 'group'; id: string },
  member: boolean,
): Promise<FolderOpResult<{ scopeKey: string; member: boolean }>> {
  const folder = await prisma.chatFolder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!folder) return { ok: false, status: 404, error: 'Folder not found' };
  const scopeKey = scopeKeyOf(chat.kind, chat.id);

  if (!member) {
    await prisma.chatFolderItem.deleteMany({ where: { folderId, scopeKey } });
    return { ok: true, value: { scopeKey, member } };
  }
  if (!(await getChatAccess(chat.kind, chat.id, userId))) {
    return { ok: false, status: 404, error: 'Chat not found' };
  }
  const count = await prisma.chatFolderItem.count({ where: { folderId } });
  if (count >= MAX_FOLDER_CHATS) {
    return { ok: false, status: 409, error: 'That folder is full' };
  }
  await prisma.chatFolderItem.upsert({
    where: { folderId_scopeKey: { folderId, scopeKey } },
    create: { folderId, scopeKey },
    update: {},
  });
  return { ok: true, value: { scopeKey, member } };
}

/** Ids of the chats of one kind inside a folder (null if it isn't the viewer's). */
export async function folderChatIds(
  userId: string,
  folderId: string,
  kind: 'dm' | 'group',
): Promise<string[] | null> {
  const folder = await prisma.chatFolder.findFirst({
    where: { id: folderId, userId },
    select: {
      items: {
        where: { scopeKey: { startsWith: `${kind}:` } },
        select: { scopeKey: true },
        take: MAX_FOLDER_CHATS,
      },
    },
  });
  if (!folder) return null;
  return folder.items.map((i) => parseScopeKey(i.scopeKey)?.id).filter((x): x is string => !!x);
}

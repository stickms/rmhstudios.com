/**
 * A member's private deck folders. A folder is the owner's organisation only: it is read by the owner's own
 * list and export, never by a public payload, the marketplace or the developer API.
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import {
  MAX_FOLDERS_PER_MEMBER,
  moveWithin,
  normalizeFolderName,
  sameFolderName,
  type DeckFolderSummary,
} from '@/lib/study/folders';

export type FolderResult<T = object> = ({ ok: true } & T) | { ok: false; status: 400 | 404 | 409; error: string };

const folderSelect = { id: true, name: true, position: true, collapsed: true } as const;

export async function listFolders(userId: string): Promise<DeckFolderSummary[]> {
  const rows = await prisma.deckFolder.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: folderSelect,
  });
  return Array.isArray(rows) ? rows : [];
}

/** Whether the folder exists and is the member's (the review queue's 404). */
export async function ownsFolder(userId: string, folderId: string): Promise<boolean> {
  const row = await prisma.deckFolder.findFirst({ where: { id: folderId, userId }, select: { id: true } });
  return !!row;
}

/** The 30-folder cap and the unique name are checked, then the row inserted, under one per-member lock. */
export async function createFolder(userId: string, rawName: string): Promise<FolderResult<{ folder: DeckFolderSummary }>> {
  const name = normalizeFolderName(rawName);
  if (!name) return { ok: false, status: 400, error: 'Invalid name' };
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, 'deck-folders:' + userId);
    const existing = await tx.deckFolder.findMany({ where: { userId }, select: { name: true, position: true } });
    if (existing.length >= MAX_FOLDERS_PER_MEMBER) {
      return { ok: false, status: 400, error: 'Too many folders' } as const;
    }
    if (existing.some((f) => sameFolderName(f.name, name))) {
      return { ok: false, status: 409, error: 'Name taken' } as const;
    }
    const position = existing.reduce((max, f) => Math.max(max, f.position), -1) + 1;
    const folder = await tx.deckFolder.create({ data: { userId, name, position }, select: folderSelect });
    return { ok: true, folder } as const;
  });
}

export async function renameFolder(userId: string, folderId: string, rawName: string): Promise<FolderResult> {
  const name = normalizeFolderName(rawName);
  if (!name) return { ok: false, status: 400, error: 'Invalid name' };
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, 'deck-folders:' + userId);
    const all = await tx.deckFolder.findMany({ where: { userId }, select: { id: true, name: true } });
    if (!all.some((f) => f.id === folderId)) return { ok: false, status: 404, error: 'Not found' } as const;
    if (all.some((f) => f.id !== folderId && sameFolderName(f.name, name))) {
      return { ok: false, status: 409, error: 'Name taken' } as const;
    }
    await tx.deckFolder.updateMany({ where: { id: folderId, userId }, data: { name } });
    return { ok: true } as const;
  });
}

/** Move one step up or down; positions are rewritten 0..n-1 so they stay dense. */
export async function moveFolder(userId: string, folderId: string, direction: 'up' | 'down'): Promise<FolderResult> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, 'deck-folders:' + userId);
    const all = await tx.deckFolder.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const ids = all.map((f) => f.id);
    const next = moveWithin(ids, folderId, direction);
    if (!next) return { ok: false, status: 404, error: 'Not found' } as const;
    for (let i = 0; i < next.length; i++) {
      await tx.deckFolder.updateMany({ where: { id: next[i] as string, userId }, data: { position: i } });
    }
    return { ok: true } as const;
  });
}

export async function setCollapsed(userId: string, folderId: string, collapsed: boolean): Promise<FolderResult> {
  const { count } = await prisma.deckFolder.updateMany({ where: { id: folderId, userId }, data: { collapsed } });
  return count === 0 ? { ok: false, status: 404, error: 'Not found' } : { ok: true };
}

/** Deletes the folder only. `flashcard_deck.folderId` is `ON DELETE SET NULL`, so its decks move to "No folder". */
export async function deleteFolder(userId: string, folderId: string): Promise<FolderResult> {
  const { count } = await prisma.deckFolder.deleteMany({ where: { id: folderId, userId } });
  return count === 0 ? { ok: false, status: 404, error: 'Not found' } : { ok: true };
}

/**
 * Put the member's deck in the member's folder (or none). One `updateMany` carries both ownership conditions:
 * the deck is the caller's, and the folder belongs to the same user. Either failing is a 404.
 */
export async function moveDeck(userId: string, deckId: string, folderId: string | null): Promise<FolderResult> {
  const { count } = await prisma.flashcardDeck.updateMany({
    where: {
      id: deckId,
      userId,
      ...(folderId ? { user: { deckFolders: { some: { id: folderId } } } } : {}),
    },
    data: { folderId },
  });
  return count === 0 ? { ok: false, status: 404, error: 'Not found' } : { ok: true };
}

/** Account deletion anonymises in place, so the cascade never fires: the member's folders are removed here. */
export function deckFolderErasureOps(userId: string) {
  return [
    prisma.flashcardDeck.updateMany({ where: { userId, folderId: { not: null } }, data: { folderId: null } }),
    prisma.deckFolder.deleteMany({ where: { userId } }),
  ];
}

/** The member's folders for the account export: name, order, collapse state and the ids of their decks. */
export async function exportDeckFolders(userId: string) {
  const rows = await prisma.deckFolder.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      name: true,
      position: true,
      collapsed: true,
      createdAt: true,
      decks: { where: { userId }, select: { id: true } },
    },
  });
  return (Array.isArray(rows) ? rows : []).map((f) => ({
    name: f.name,
    position: f.position,
    collapsed: f.collapsed,
    createdAt: f.createdAt.toISOString(),
    deckIds: f.decks.map((d) => d.id),
  }));
}

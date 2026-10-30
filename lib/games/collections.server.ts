/**
 * Library collections: read, add or remove a title, delete, rename, and the one-time
 * import of browser-stored favorites. A collection exists while it holds a title.
 * Names are matched case-insensitively and keep the spelling they were first given.
 */

import { prisma } from '@/lib/prisma.server';
import { listCuratedBuilds } from '@/lib/builds/curated';
import {
  FAVORITES,
  MAX_COLLECTIONS,
  MAX_ITEMS,
  groupCollections,
  normalizeCollectionName,
  type Collection,
} from '@/lib/games/collections';

export type CollectionErrorCode = 'NOT_FOUND' | 'BAD_NAME' | 'TOO_MANY' | 'EXISTS';

const STATUS: Record<CollectionErrorCode, number> = {
  NOT_FOUND: 404,
  BAD_NAME: 400,
  TOO_MANY: 409,
  EXISTS: 409,
};

export class CollectionError extends Error {
  readonly status: number;
  constructor(readonly code: CollectionErrorCode) {
    super(code);
    this.name = 'CollectionError';
    this.status = STATUS[code];
  }
}

const validGame = (id: string) => listCuratedBuilds().some((b) => b.id === id);

export async function listCollections(userId: string): Promise<Collection[]> {
  const rows = await prisma.gameCollectionItem.findMany({
    where: { userId },
    select: { collection: true, gameId: true },
  });
  return groupCollections(rows);
}

/** The stored spelling of `name` if the member already has it (any case), else null. */
function existing(all: Collection[], name: string): string | null {
  const lower = name.toLowerCase();
  return all.find((c) => c.name.toLowerCase() === lower)?.name ?? null;
}

export async function setItem(input: {
  userId: string;
  collection: string;
  gameId: string;
  on: boolean;
}): Promise<void> {
  const { userId, gameId, on } = input;
  if (!validGame(gameId)) throw new CollectionError('NOT_FOUND');

  const isFav = input.collection === FAVORITES;
  let name = FAVORITES;
  if (!isFav) {
    const n = normalizeCollectionName(input.collection);
    if (!n.ok) throw new CollectionError('BAD_NAME');
    name = n.name;
  }

  const all = await listCollections(userId);
  const canonical = isFav ? FAVORITES : (existing(all, name) ?? name);

  if (!on) {
    await prisma.gameCollectionItem.deleteMany({ where: { userId, collection: canonical, gameId } });
    return;
  }
  const current = all.find((c) => c.name === canonical);
  if (!current && !isFav && all.filter((c) => c.name !== FAVORITES).length >= MAX_COLLECTIONS) {
    throw new CollectionError('TOO_MANY');
  }
  if ((current?.ids.length ?? 0) >= MAX_ITEMS && !current?.ids.includes(gameId)) {
    throw new CollectionError('TOO_MANY');
  }
  await prisma.gameCollectionItem.createMany({
    data: [{ userId, collection: canonical, gameId }],
    skipDuplicates: true,
  });
}

export async function deleteCollection(input: { userId: string; collection: string }): Promise<void> {
  const all = await listCollections(input.userId);
  const canonical = input.collection === FAVORITES ? FAVORITES : existing(all, input.collection);
  if (!canonical) return; // already gone: deleting twice is not an error
  await prisma.gameCollectionItem.deleteMany({ where: { userId: input.userId, collection: canonical } });
}

export async function renameCollection(input: { userId: string; from: string; to: string }): Promise<void> {
  if (input.from === FAVORITES) throw new CollectionError('BAD_NAME');
  const n = normalizeCollectionName(input.to);
  if (!n.ok) throw new CollectionError('BAD_NAME');
  const all = await listCollections(input.userId);
  const from = existing(all, input.from);
  if (!from) throw new CollectionError('NOT_FOUND');
  const clash = existing(all, n.name);
  // Changing only the case of its own name is fine.
  if (clash && clash !== from) throw new CollectionError('EXISTS');
  await prisma.gameCollectionItem.updateMany({
    where: { userId: input.userId, collection: from },
    data: { collection: n.name },
  });
}

/** One-time move of browser-stored favorites onto the account. Junk and unknown ids are ignored. */
export async function importFavorites(userId: string, ids: unknown[]): Promise<void> {
  const wanted = [...new Set(ids.filter((x): x is string => typeof x === 'string' && validGame(x)))].slice(
    0,
    MAX_ITEMS,
  );
  if (wanted.length === 0) return;
  await prisma.gameCollectionItem.createMany({
    data: wanted.map((gameId) => ({ userId, collection: FAVORITES, gameId })),
    skipDuplicates: true,
  });
}

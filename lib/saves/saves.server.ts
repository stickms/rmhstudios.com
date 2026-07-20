/**
 * Unified Saves — server logic (§4). Add/remove saves, folder CRUD, and
 * hydration of saved items to display shapes with per-type visibility guards
 * and tombstones for gone/hidden targets.
 */
import { prisma } from '@/lib/prisma.server';
import {
  MAX_FOLDERS,
  type SaveEntityType,
  type HydratedSave,
  type SaveFolderView,
} from '@/lib/saves/types';

export async function addSave(
  userId: string,
  input: { entityType: SaveEntityType; entityId: string; folderId?: string | null },
): Promise<void> {
  // If a folder is named, it must belong to the caller.
  if (input.folderId) {
    const owned = await prisma.saveFolder.findFirst({
      where: { id: input.folderId, userId },
      select: { id: true },
    });
    if (!owned) throw new Error('folder-not-found');
  }
  await prisma.savedItem.upsert({
    where: {
      userId_entityType_entityId: {
        userId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    },
    create: {
      userId,
      entityType: input.entityType,
      entityId: input.entityId,
      folderId: input.folderId ?? null,
    },
    // Re-saving an existing item can move it to a new folder.
    update: input.folderId !== undefined ? { folderId: input.folderId } : {},
  });
}

export async function removeSave(
  userId: string,
  entityType: SaveEntityType,
  entityId: string,
): Promise<void> {
  await prisma.savedItem.deleteMany({ where: { userId, entityType, entityId } });
}

export async function listFolders(userId: string): Promise<SaveFolderView[]> {
  const folders = await prisma.saveFolder.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, sortOrder: true, _count: { select: { items: true } } },
  });
  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    sortOrder: f.sortOrder,
    count: f._count.items,
  }));
}

export async function createFolder(userId: string, name: string): Promise<SaveFolderView> {
  const count = await prisma.saveFolder.count({ where: { userId } });
  if (count >= MAX_FOLDERS) throw new Error('folder-limit');
  const folder = await prisma.saveFolder.create({
    data: { userId, name, sortOrder: count },
    select: { id: true, name: true, sortOrder: true },
  });
  return { ...folder, count: 0 };
}

export async function updateFolder(
  userId: string,
  folderId: string,
  data: { name?: string; sortOrder?: number },
): Promise<void> {
  const res = await prisma.saveFolder.updateMany({ where: { id: folderId, userId }, data });
  if (res.count === 0) throw new Error('folder-not-found');
}

/** Delete a folder; its items are re-homed to the default (folderId = null). */
export async function deleteFolder(userId: string, folderId: string): Promise<void> {
  const owned = await prisma.saveFolder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });
  if (!owned) throw new Error('folder-not-found');
  await prisma.savedItem.updateMany({ where: { userId, folderId }, data: { folderId: null } });
  await prisma.saveFolder.delete({ where: { id: folderId } });
}

export interface ListSavesResult {
  items: HydratedSave[];
  nextCursor: string | null;
}

const PAGE = 30;

export async function listSaves(
  userId: string,
  opts: { folderId?: string | null | 'default'; type?: SaveEntityType; cursor?: string } = {},
): Promise<ListSavesResult> {
  const where: {
    userId: string;
    folderId?: string | null;
    entityType?: SaveEntityType;
  } = { userId };
  if (opts.folderId === 'default') where.folderId = null;
  else if (opts.folderId) where.folderId = opts.folderId;
  if (opts.type) where.entityType = opts.type;

  const rows = await prisma.savedItem.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: PAGE + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: { id: true, entityType: true, entityId: true, folderId: true, createdAt: true },
  });

  const hasMore = rows.length > PAGE;
  const page = hasMore ? rows.slice(0, PAGE) : rows;
  const items = await hydrateSaves(userId, page);
  return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
}

type SavedRow = {
  id: string;
  entityType: string;
  entityId: string;
  folderId: string | null;
  createdAt: Date;
};

/**
 * Resolve saved rows to display shapes, batched per entity type, honoring each
 * type's visibility. Missing / no-longer-visible targets become tombstones.
 */
export async function hydrateSaves(
  viewerId: string,
  rows: SavedRow[],
): Promise<HydratedSave[]> {
  const byType = new Map<string, string[]>();
  for (const r of rows) {
    const list = byType.get(r.entityType) ?? [];
    list.push(r.entityId);
    byType.set(r.entityType, list);
  }

  // Posts.
  const postMap = new Map<
    string,
    { content: string; audience: string; userId: string; handle: string | null }
  >();
  if (byType.has('rmhark')) {
    const posts = await prisma.rMHark.findMany({
      where: { id: { in: byType.get('rmhark')! } },
      select: { id: true, content: true, audience: true, userId: true, user: { select: { handle: true } } },
    });
    for (const p of posts) {
      postMap.set(p.id, {
        content: p.content,
        audience: String(p.audience),
        userId: p.userId,
        handle: p.user?.handle ?? null,
      });
    }
  }

  // Builds.
  const buildMap = new Map<
    string,
    { slug: string; title: string; thumbnailUrl: string | null; visibility: string; userId: string }
  >();
  if (byType.has('build')) {
    const builds = await prisma.userBuild.findMany({
      where: { id: { in: byType.get('build')! } },
      select: { id: true, slug: true, title: true, thumbnailUrl: true, visibility: true, userId: true },
    });
    for (const b of builds) {
      buildMap.set(b.id, {
        slug: b.slug,
        title: b.title,
        thumbnailUrl: b.thumbnailUrl,
        visibility: String(b.visibility),
        userId: b.userId,
      });
    }
  }

  return rows.map((r): HydratedSave => {
    const base = {
      id: r.id,
      entityType: r.entityType as SaveEntityType,
      entityId: r.entityId,
      folderId: r.folderId,
      createdAt: r.createdAt.toISOString(),
    };
    if (r.entityType === 'rmhark') {
      const p = postMap.get(r.entityId);
      if (!p || (p.audience !== 'PUBLIC' && p.userId !== viewerId)) {
        return { ...base, title: '', subtitle: null, href: null, thumbnail: null, tombstone: true };
      }
      const text = p.content.trim().replace(/\s+/g, ' ');
      return {
        ...base,
        title: text.length > 100 ? `${text.slice(0, 100)}…` : text || '(post)',
        subtitle: p.handle ? `@${p.handle}` : null,
        href: `/thread/${r.entityId}`,
        thumbnail: null,
        tombstone: false,
      };
    }
    if (r.entityType === 'build') {
      const b = buildMap.get(r.entityId);
      if (!b || (b.visibility !== 'PUBLIC' && b.userId !== viewerId)) {
        return { ...base, title: '', subtitle: null, href: null, thumbnail: null, tombstone: true };
      }
      return {
        ...base,
        title: b.title,
        subtitle: null,
        href: `/builds/${b.slug}`,
        thumbnail: b.thumbnailUrl,
        tombstone: false,
      };
    }
    // Types without a hydrator yet (song/tube_video/…) — render a neutral card.
    return { ...base, title: '', subtitle: null, href: null, thumbnail: null, tombstone: true };
  });
}

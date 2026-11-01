/**
 * Persistent media playlists (music/video) — the durable personal library
 * behind the apps' ephemeral room queues. The owner can do everything; invited
 * collaborators can read a playlist and add/remove its items. Every "may this
 * user edit this playlist" decision goes through `canEditPlaylist` below.
 */

import { prisma } from '@/lib/prisma.server';

export type PlaylistKind = 'music' | 'video';

export const MAX_PLAYLISTS = 100;
export const MAX_ITEMS = 500;
export const MAX_COLLABORATORS = 10;

export type PlaylistRole = 'owner' | 'collaborator';

/** Rows the user may open: their own, or ones they collaborate on. */
function accessWhere(userId: string) {
  return { OR: [{ userId }, { collaborators: { some: { userId } } }] };
}

/**
 * The single permission check for changing a playlist's contents. True for the
 * owner and for collaborators; false for everyone else (and for unknown ids).
 * Renaming, deleting and managing collaborators are owner-only: use
 * `isPlaylistOwner`.
 */
export async function canEditPlaylist(userId: string, playlistId: string): Promise<boolean> {
  const row = await prisma.playlist.findFirst({
    where: { id: playlistId, ...accessWhere(userId) },
    select: { id: true },
  });
  return row !== null;
}

export async function isPlaylistOwner(userId: string, playlistId: string): Promise<boolean> {
  const row = await prisma.playlist.findFirst({
    where: { id: playlistId, userId },
    select: { id: true },
  });
  return row !== null;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  kind: string;
  itemCount: number;
  updatedAt: string;
  role: PlaylistRole;
}

export interface PlaylistItemView {
  id: string;
  externalId: string;
  title: string;
  subtitle: string | null;
  thumbnail: string | null;
  url: string | null;
  durationMs: number | null;
}

export interface PlaylistDetail {
  id: string;
  name: string;
  kind: string;
  role: PlaylistRole;
  items: PlaylistItemView[];
}

export interface NewItem {
  externalId: string;
  title: string;
  subtitle?: string | null;
  thumbnail?: string | null;
  url?: string | null;
  durationMs?: number | null;
}

export async function listPlaylists(
  userId: string,
  kind?: PlaylistKind,
): Promise<PlaylistSummary[]> {
  const rows = await prisma.playlist.findMany({
    where: { ...accessWhere(userId), ...(kind ? { kind } : {}) },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, kind: true, itemCount: true, updatedAt: true, userId: true },
  });
  return rows.map(({ userId: ownerId, ...r }) => ({
    ...r,
    updatedAt: r.updatedAt.toISOString(),
    role: ownerId === userId ? ('owner' as const) : ('collaborator' as const),
  }));
}

export async function getPlaylist(id: string, userId: string): Promise<PlaylistDetail | null> {
  const pl = await prisma.playlist.findFirst({
    where: { id, ...accessWhere(userId) },
    select: {
      id: true,
      name: true,
      kind: true,
      userId: true,
      items: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          externalId: true,
          title: true,
          subtitle: true,
          thumbnail: true,
          url: true,
          durationMs: true,
        },
      },
    },
  });
  if (!pl) return null;
  const { userId: ownerId, ...rest } = pl;
  return { ...rest, role: ownerId === userId ? 'owner' : 'collaborator' };
}

export type CreateResult = { ok: true; id: string } | { ok: false; error: string; status: number };

export async function createPlaylist(
  userId: string,
  name: string,
  kind: PlaylistKind,
): Promise<CreateResult> {
  const count = await prisma.playlist.count({ where: { userId } });
  if (count >= MAX_PLAYLISTS) return { ok: false, error: 'Too many playlists', status: 400 };
  const pl = await prisma.playlist.create({
    data: { userId, name: name.trim().slice(0, 100) || 'Untitled', kind },
    select: { id: true },
  });
  return { ok: true, id: pl.id };
}

/** Rename (owner only). Returns false when the playlist isn't the caller's. */
export async function renamePlaylist(id: string, userId: string, name: string): Promise<boolean> {
  const res = await prisma.playlist.updateMany({
    where: { id, userId },
    data: { name: name.trim().slice(0, 100) || 'Untitled' },
  });
  return res.count > 0;
}

export async function deletePlaylist(id: string, userId: string): Promise<boolean> {
  const res = await prisma.playlist.deleteMany({ where: { id, userId } });
  return res.count > 0;
}

export type AddItemResult =
  { ok: true; duplicate: boolean } | { ok: false; error: string; status: number };

export async function addItem(
  playlistId: string,
  userId: string,
  item: NewItem,
): Promise<AddItemResult> {
  if (!(await canEditPlaylist(userId, playlistId))) {
    return { ok: false, error: 'Playlist not found', status: 404 };
  }
  const pl = await prisma.playlist.findUnique({
    where: { id: playlistId },
    select: { id: true, itemCount: true },
  });
  if (!pl) return { ok: false, error: 'Playlist not found', status: 404 };
  if (pl.itemCount >= MAX_ITEMS) return { ok: false, error: 'Playlist is full', status: 400 };

  // De-dupe by externalId so re-adding a track is a no-op.
  const existing = await prisma.playlistItem.findFirst({
    where: { playlistId, externalId: item.externalId },
    select: { id: true },
  });
  if (existing) return { ok: true, duplicate: true };

  await prisma.$transaction([
    prisma.playlistItem.create({
      data: {
        playlistId,
        position: pl.itemCount,
        externalId: item.externalId.slice(0, 255),
        title: item.title.slice(0, 300),
        subtitle: item.subtitle?.slice(0, 300) ?? null,
        thumbnail: item.thumbnail?.slice(0, 500) ?? null,
        url: item.url?.slice(0, 1000) ?? null,
        durationMs: item.durationMs ?? null,
      },
    }),
    prisma.playlist.update({
      where: { id: playlistId },
      data: { itemCount: { increment: 1 } },
    }),
  ]);
  return { ok: true, duplicate: false };
}

export async function removeItem(
  playlistId: string,
  itemId: string,
  userId: string,
): Promise<boolean> {
  if (!(await canEditPlaylist(userId, playlistId))) return false;
  const res = await prisma.playlistItem.deleteMany({ where: { id: itemId, playlistId } });
  if (res.count === 0) return false;
  await prisma.playlist.update({
    where: { id: playlistId },
    data: { itemCount: { decrement: 1 } },
  });
  return true;
}

// ─── Collaborators (owner-managed) ─────────────────────────────────────────

export interface CollaboratorView {
  userId: string;
  handle: string | null;
  name: string | null;
  image: string | null;
}

export type CollaboratorResult = { ok: true } | { ok: false; error: string; status: number };

/** Owner only: null when the caller doesn't own the playlist. */
export async function listCollaborators(
  playlistId: string,
  ownerId: string,
): Promise<CollaboratorView[] | null> {
  if (!(await isPlaylistOwner(ownerId, playlistId))) return null;
  const rows = await prisma.playlistCollaborator.findMany({
    where: { playlistId },
    orderBy: { createdAt: 'asc' },
    select: { user: { select: { id: true, handle: true, name: true, image: true } } },
  });
  return rows.map(({ user }) => ({
    userId: user.id,
    handle: user.handle,
    name: user.name,
    image: user.image,
  }));
}

/** Owner only: invite a user by (already normalised) handle. */
export async function addCollaborator(
  playlistId: string,
  ownerId: string,
  handle: string,
): Promise<CollaboratorResult> {
  if (!(await isPlaylistOwner(ownerId, playlistId))) {
    return { ok: false, error: 'Playlist not found', status: 404 };
  }
  const target = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
  if (!target) return { ok: false, error: 'No user with that handle', status: 404 };
  if (target.id === ownerId) {
    return { ok: false, error: 'You already own this playlist', status: 400 };
  }
  const count = await prisma.playlistCollaborator.count({ where: { playlistId } });
  if (count >= MAX_COLLABORATORS) {
    return { ok: false, error: 'Too many collaborators', status: 400 };
  }
  // Unique (playlistId, userId): re-inviting is a no-op.
  await prisma.playlistCollaborator.upsert({
    where: { playlistId_userId: { playlistId, userId: target.id } },
    create: { playlistId, userId: target.id },
    update: {},
  });
  return { ok: true };
}

/** Owner only: drop a collaborator. */
export async function removeCollaborator(
  playlistId: string,
  ownerId: string,
  collaboratorUserId: string,
): Promise<boolean> {
  if (!(await isPlaylistOwner(ownerId, playlistId))) return false;
  const res = await prisma.playlistCollaborator.deleteMany({
    where: { playlistId, userId: collaboratorUserId },
  });
  return res.count > 0;
}

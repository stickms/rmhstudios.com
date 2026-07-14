/**
 * Persistent media playlists (music/video) — the durable personal library
 * behind the apps' ephemeral room queues. All reads/writes are owner-scoped.
 */

import { prisma } from '@/lib/prisma.server';

export type PlaylistKind = 'music' | 'video';

export const MAX_PLAYLISTS = 100;
export const MAX_ITEMS = 500;

export interface PlaylistSummary {
  id: string;
  name: string;
  kind: string;
  itemCount: number;
  updatedAt: string;
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

export async function listPlaylists(userId: string, kind?: PlaylistKind): Promise<PlaylistSummary[]> {
  const rows = await prisma.playlist.findMany({
    where: { userId, ...(kind ? { kind } : {}) },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, kind: true, itemCount: true, updatedAt: true },
  });
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function getPlaylist(id: string, userId: string): Promise<PlaylistDetail | null> {
  const pl = await prisma.playlist.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      kind: true,
      items: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, externalId: true, title: true, subtitle: true, thumbnail: true, url: true, durationMs: true },
      },
    },
  });
  return pl;
}

export type CreateResult = { ok: true; id: string } | { ok: false; error: string; status: number };

export async function createPlaylist(userId: string, name: string, kind: PlaylistKind): Promise<CreateResult> {
  const count = await prisma.playlist.count({ where: { userId } });
  if (count >= MAX_PLAYLISTS) return { ok: false, error: 'Too many playlists', status: 400 };
  const pl = await prisma.playlist.create({
    data: { userId, name: name.trim().slice(0, 100) || 'Untitled', kind },
    select: { id: true },
  });
  return { ok: true, id: pl.id };
}

/** Rename. Returns false when the playlist isn't the caller's. */
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
  | { ok: true; duplicate: boolean }
  | { ok: false; error: string; status: number };

export async function addItem(playlistId: string, userId: string, item: NewItem): Promise<AddItemResult> {
  const pl = await prisma.playlist.findFirst({
    where: { id: playlistId, userId },
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

export async function removeItem(playlistId: string, itemId: string, userId: string): Promise<boolean> {
  const pl = await prisma.playlist.findFirst({ where: { id: playlistId, userId }, select: { id: true } });
  if (!pl) return false;
  const res = await prisma.playlistItem.deleteMany({ where: { id: itemId, playlistId } });
  if (res.count === 0) return false;
  await prisma.playlist.update({
    where: { id: playlistId },
    data: { itemCount: { decrement: 1 } },
  });
  return true;
}

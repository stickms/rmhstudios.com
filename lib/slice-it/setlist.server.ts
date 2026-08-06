/**
 * S8 — setlists.
 *
 * The library sorts and searches and nothing collects. `SongLike` exists, but a
 * like is a signal, not a collection: it has no order, no name, and no way to
 * say "these six, in this order, back to back".
 *
 * ## The array column
 *
 * `SliceSetlist.songIds` is a `String[]`, not a join table with a `position`
 * column. A setlist is read whole, written whole, and **its order is the data** —
 * a join table would need a position column, a transaction to reorder and a
 * GROUP BY to read one list, three mechanisms to express what an array
 * expresses by existing.
 *
 * The cost is real and is handled here: a deleted song leaves a dangling id.
 * {@link resolveSetlist} filters to the ids that still resolve and preserves the
 * stored order, so a setlist quietly shrinks rather than 404ing on a track
 * somebody else deleted. The stored array is *not* rewritten on read — a read
 * path that repairs data is a read path that writes under load.
 *
 * ## Liked songs
 *
 * "Play my liked songs" is not a stored setlist and never becomes one. It is
 * {@link likedSongsSetlist}, a virtual list assembled from `SongLike` at read
 * time, so liking a song adds it and unliking removes it with no sync step and
 * no second copy of the truth to drift.
 */

import { prisma } from '@/lib/prisma.server';
import { uuidv7 } from './editor/uuid';

/** Hard cap on entries. A setlist is a set, not a library export. */
export const MAX_SETLIST_SONGS = 50;
/** How many setlists one account may keep. */
export const MAX_SETLISTS_PER_USER = 50;
/** Page size for the public browse. */
export const SETLIST_BROWSE_LIMIT = 30;

/** The `id` a virtual liked-songs list reports. Never a database row. */
export const LIKED_SETLIST_ID = 'liked';

/** One entry of a resolved setlist — enough to render a row and start a run. */
export interface SetlistSong {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  duration: number;
  chartRating: number | null;
}

/** A setlist with its songs resolved, in stored order. */
export interface ResolvedSetlist {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  ownerId: string;
  ownerName: string;
  /** True when the viewer may edit it. */
  isOwner: boolean;
  songs: SetlistSong[];
  /** Ids that no longer resolve to a song. Surfaced, not silently dropped. */
  missingCount: number;
  createdAt: string;
  updatedAt: string;
}

/** The summary shape the list views render. */
export interface SetlistSummary {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  ownerId: string;
  ownerName: string;
  isOwner: boolean;
  songCount: number;
  updatedAt: string;
}

const songSelect = {
  id: true,
  title: true,
  artist: true,
  coverUrl: true,
  duration: true,
  chartRating: true,
} as const;

const ownerSelect = { id: true, name: true, username: true } as const;

function ownerName(owner: { name: string | null; username: string | null } | null): string {
  return owner?.username || owner?.name || 'Player';
}

/**
 * Fetch the songs for a list of ids and return them **in the given order**.
 *
 * Postgres returns an `IN (...)` result in whatever order it likes, so the
 * ordering has to be reimposed here. Duplicates in the input are preserved —
 * playing the same track twice in a set is a legitimate thing to want, and a
 * `Map` lookup per position gives it for free.
 */
async function orderedSongs(songIds: string[]): Promise<SetlistSong[]> {
  if (songIds.length === 0) return [];
  const rows = await prisma.song.findMany({
    where: { id: { in: Array.from(new Set(songIds)) } },
    select: songSelect,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return songIds
    .map((id) => byId.get(id))
    .filter((s): s is (typeof rows)[number] => Boolean(s))
    .map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      coverUrl: s.coverUrl,
      duration: s.duration,
      chartRating: s.chartRating,
    }));
}

/** Every setlist the viewer owns, newest first. */
export async function listOwnSetlists(userId: string): Promise<SetlistSummary[]> {
  const rows = await prisma.sliceSetlist.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_SETLISTS_PER_USER,
    select: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
      ownerId: true,
      songIds: true,
      updatedAt: true,
      owner: { select: ownerSelect },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isPublic: row.isPublic,
    ownerId: row.ownerId,
    ownerName: ownerName(row.owner),
    isOwner: true,
    songCount: row.songIds.length,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** The public browse — shared setlists from everyone, newest first. */
export async function listPublicSetlists(
  viewerId: string | null,
  limit = SETLIST_BROWSE_LIMIT,
): Promise<SetlistSummary[]> {
  const rows = await prisma.sliceSetlist.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
      ownerId: true,
      songIds: true,
      updatedAt: true,
      owner: { select: ownerSelect },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isPublic: row.isPublic,
    ownerId: row.ownerId,
    ownerName: ownerName(row.owner),
    isOwner: row.ownerId === viewerId,
    songCount: row.songIds.length,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * One setlist, resolved.
 *
 * Returns null both for "no such row" and for "private, and not yours". The two
 * are deliberately indistinguishable to a caller: a 404 that differs from a 403
 * tells a stranger that a private setlist with that id exists.
 */
export async function resolveSetlist(
  id: string,
  viewerId: string | null,
): Promise<ResolvedSetlist | null> {
  const row = await prisma.sliceSetlist.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      isPublic: true,
      ownerId: true,
      songIds: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: ownerSelect },
    },
  });
  if (!row) return null;
  if (!row.isPublic && row.ownerId !== viewerId) return null;

  const songs = await orderedSongs(row.songIds);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isPublic: row.isPublic,
    ownerId: row.ownerId,
    ownerName: ownerName(row.owner),
    isOwner: row.ownerId === viewerId,
    songs,
    missingCount: row.songIds.length - songs.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * "Play my liked songs" — a virtual setlist over `SongLike`.
 *
 * Ordered most-recently-liked first, which is the order a player thinks in when
 * they hit the button. Never persisted: the likes are the list.
 */
export async function likedSongsSetlist(userId: string): Promise<ResolvedSetlist> {
  const likes = await prisma.songLike.findMany({
    where: { userId, song: { isPublic: true } },
    orderBy: { createdAt: 'desc' },
    take: MAX_SETLIST_SONGS,
    select: { song: { select: songSelect } },
  });
  const now = new Date().toISOString();
  return {
    id: LIKED_SETLIST_ID,
    name: 'Liked Songs',
    description: null,
    isPublic: false,
    ownerId: userId,
    ownerName: 'You',
    isOwner: false, // Virtual: there is nothing to edit.
    songs: likes.map((l) => ({
      id: l.song.id,
      title: l.song.title,
      artist: l.song.artist,
      coverUrl: l.song.coverUrl,
      duration: l.song.duration,
      chartRating: l.song.chartRating,
    })),
    missingCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export interface SetlistInput {
  name: string;
  description?: string | null;
  isPublic?: boolean;
  songIds: string[];
}

/**
 * Drop ids that are not real, public-or-owned songs, keeping order.
 *
 * A create/update is the one place where filtering the array is right: the
 * client sends ids from a library it may have had open for a while, and storing
 * an id that never resolved would be storing a lie. Read paths do not do this
 * (see the module header).
 */
async function validSongIds(songIds: string[], userId: string): Promise<string[]> {
  const unique = Array.from(new Set(songIds)).slice(0, MAX_SETLIST_SONGS);
  if (unique.length === 0) return [];
  const rows = await prisma.song.findMany({
    where: { id: { in: unique }, OR: [{ isPublic: true }, { uploadedBy: userId }] },
    select: { id: true },
  });
  const ok = new Set(rows.map((r) => r.id));
  return songIds.filter((id) => ok.has(id)).slice(0, MAX_SETLIST_SONGS);
}

export type SetlistWriteResult =
  { ok: true; setlist: ResolvedSetlist } | { ok: false; reason: 'limit-reached' | 'not-found' };

/**
 * Create a setlist.
 *
 * The id is generated here by `uuidv7()` rather than left to the column
 * default, for the reason the `Chart` model documents: `uuid_generate_v7()` is
 * not installed in this database, so the column default is `gen_random_uuid()`
 * (v4, not time-sortable) and the time-sortable value has to come from the
 * application.
 */
export async function createSetlist(
  userId: string,
  input: SetlistInput,
): Promise<SetlistWriteResult> {
  const count = await prisma.sliceSetlist.count({ where: { ownerId: userId } });
  if (count >= MAX_SETLISTS_PER_USER) return { ok: false, reason: 'limit-reached' };

  const songIds = await validSongIds(input.songIds, userId);
  const created = await prisma.sliceSetlist.create({
    data: {
      id: uuidv7(),
      ownerId: userId,
      name: input.name,
      description: input.description ?? null,
      isPublic: input.isPublic ?? false,
      songIds,
    },
    select: { id: true },
  });

  const setlist = await resolveSetlist(created.id, userId);
  return setlist ? { ok: true, setlist } : { ok: false, reason: 'not-found' };
}

/**
 * Replace a setlist.
 *
 * Whole-object, matching how the data is shaped: there is no "insert at
 * position 3" operation because the array IS the order, so the editor sends the
 * order it wants and this stores it. Ownership is enforced in the `where` of the
 * update rather than by a read first — same reasoning as the daily's unique
 * index, one statement that cannot be raced.
 */
export async function updateSetlist(
  userId: string,
  id: string,
  input: Partial<SetlistInput>,
): Promise<SetlistWriteResult> {
  const songIds =
    input.songIds === undefined ? undefined : await validSongIds(input.songIds, userId);

  const result = await prisma.sliceSetlist.updateMany({
    where: { id, ownerId: userId },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.isPublic === undefined ? {} : { isPublic: input.isPublic }),
      ...(songIds === undefined ? {} : { songIds }),
    },
  });
  if (result.count === 0) return { ok: false, reason: 'not-found' };

  const setlist = await resolveSetlist(id, userId);
  return setlist ? { ok: true, setlist } : { ok: false, reason: 'not-found' };
}

/** Delete a setlist. False when it was not the caller's to delete. */
export async function deleteSetlist(userId: string, id: string): Promise<boolean> {
  const result = await prisma.sliceSetlist.deleteMany({ where: { id, ownerId: userId } });
  return result.count > 0;
}

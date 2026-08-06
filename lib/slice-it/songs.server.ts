/**
 * Slice It — song storage and the shared read path.
 *
 * ## Where song files live
 *
 * In object storage, through `lib/storage/s3.server` — which falls back to the
 * local filesystem when S3 is not configured, so local dev is unchanged.
 *
 * They used to be written straight to `db/music` inside the web container's own
 * filesystem. That is wrong in a specific and quiet way here: production runs
 * **blue/green** web containers (`deploy/hotswap-web.sh` flips 7005/7015), so a
 * song uploaded to blue was invisible to green. Half the library would 404
 * after a deploy, and come back after the next one. Everything else in the
 * platform that stores a user file already went through the object store; songs
 * were the exception.
 *
 * ## Legacy rows
 *
 * Songs uploaded before this change carry a bare filename in `audioUrl` and a
 * `/api/slice-it/songs/cover/<file>` path in `coverUrl`. Those files are still
 * on disk on whichever container wrote them, so both readers below check the
 * object store first and fall back to the legacy path. New rows only ever store
 * object keys.
 *
 * Server-only.
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { deleteObject, getObject, putObject } from '@/lib/storage/s3.server';
import { audioContentTypeForFilename } from '@/lib/audio/transcode.server';
import { contentTypeForFilename } from '@/lib/storage/keys';
import { resolveUserDisplay } from '@/lib/user-display';
import { SONG_AUDIO_PREFIX, SONG_COVER_PREFIX } from './constants';
import type { BeatMap, SliceSong } from './types';

/* ─── Keys ──────────────────────────────────────────────────────────────── */

/** `slice-it/audio/<uuid>.m4a`. UUID rather than the uploaded name: the name is
 * attacker-controlled and the key is a path. */
export function newAudioKey(ext: string): string {
  const safeExt = /^\.[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : '.bin';
  return `${SONG_AUDIO_PREFIX}${randomUUID()}${safeExt}`;
}

export function newCoverKey(): string {
  return `${SONG_COVER_PREFIX}${randomUUID()}.webp`;
}

/** True for a value that is one of our object keys rather than a legacy name. */
function isObjectKey(value: string): boolean {
  return value.startsWith(SONG_AUDIO_PREFIX) || value.startsWith(SONG_COVER_PREFIX);
}

/**
 * Where a legacy row's file sits on disk.
 *
 * Returns null if the name would escape the directory. `path.basename` alone is
 * not enough of a guarantee to lean on for a value that came out of a database
 * row written by an older, less careful version of this code.
 */
function legacyPath(dir: string, name: string): string | null {
  const base = path.basename(name);
  if (!base || base === '.' || base === '..') return null;
  const root = path.resolve(process.cwd(), 'db', 'music', dir);
  const resolved = path.resolve(root, base);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/* ─── Writing ───────────────────────────────────────────────────────────── */

export async function storeSongAudio(buffer: Buffer, ext: string): Promise<string> {
  const key = newAudioKey(ext);
  await putObject(key, buffer, audioContentTypeForFilename(key));
  return key;
}

export async function storeSongCover(buffer: Buffer): Promise<string> {
  const key = newCoverKey();
  await putObject(key, buffer, 'image/webp');
  return key;
}

/**
 * Best-effort removal of a song's files.
 *
 * Never throws: a song row the user asked to delete must disappear from the
 * library even if the object store is having a bad minute. An orphaned object
 * is a storage-cost problem; a row that will not delete is a user-facing bug.
 */
export async function deleteSongAssets(song: {
  audioUrl: string | null;
  coverUrl: string | null;
}): Promise<void> {
  for (const value of [song.audioUrl, song.coverUrl]) {
    if (!value) continue;
    if (!isObjectKey(value)) continue;
    try {
      await deleteObject(value);
    } catch {
      // Intentionally swallowed — see above.
    }
  }
}

/* ─── Reading ───────────────────────────────────────────────────────────── */

export interface StoredFile {
  body: Buffer;
  contentType: string;
}

/** Read a song's audio, from the object store or the legacy disk path. */
export async function readSongAudio(audioUrl: string): Promise<StoredFile | null> {
  if (isObjectKey(audioUrl)) {
    const object = await getObject(audioUrl);
    if (!object) return null;
    return { body: object.body, contentType: audioContentTypeForFilename(audioUrl) };
  }

  const file = legacyPath('', audioUrl);
  if (!file) return null;
  try {
    return { body: await readFile(file), contentType: audioContentTypeForFilename(audioUrl) };
  } catch {
    return null;
  }
}

/** Read a cover, from the object store or the legacy disk path. */
export async function readSongCover(coverUrl: string): Promise<StoredFile | null> {
  if (coverUrl.startsWith(SONG_COVER_PREFIX)) {
    const object = await getObject(coverUrl);
    return object ? { body: object.body, contentType: 'image/webp' } : null;
  }

  // Legacy rows stored the whole proxy URL (`/api/slice-it/songs/cover/x.webp`);
  // the filename is its last segment.
  const name = coverUrl.split('/').pop() ?? '';
  const file = legacyPath('covers', name);
  if (!file) return null;
  try {
    return { body: await readFile(file), contentType: contentTypeForFilename(name) };
  } catch {
    return null;
  }
}

/* ─── The client DTO ────────────────────────────────────────────────────── */

/**
 * The Prisma select every song read shares.
 *
 * Deliberately excludes `analysisData`: it is the chart, hundreds of kilobytes
 * of it, and the list endpoint used to return thirty of them at once. It is
 * added back only by the single-song read, immediately before it is played.
 */
export const songSelect = {
  id: true,
  title: true,
  artist: true,
  album: true,
  description: true,
  duration: true,
  bpm: true,
  coverUrl: true,
  plays: true,
  isPublic: true,
  uploadedBy: true,
  createdAt: true,
  uploader: {
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      profile: { select: { displayName: true, customImage: true } },
    },
  },
  _count: { select: { likes: true, scores: true, comments: true } },
} as const;

/**
 * What {@link toSliceSong} needs off a row.
 *
 * Structural rather than `Prisma.SongGetPayload<…>`: the two callers select
 * slightly different things (the single-song read adds `analysisData`, the
 * signed-in paths add `likes`/`songPlays`), and pinning it to one generated
 * payload type would force a cast at every call site instead of here.
 */
type SongRow = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  description: string | null;
  duration: number;
  bpm: number | null;
  coverUrl: string | null;
  plays: number;
  isPublic: boolean;
  uploadedBy: string;
  createdAt: Date;
  uploader: {
    id?: string;
    name?: string | null;
    username?: string | null;
    image?: string | null;
    profile?: { displayName?: string | null; customImage?: string | null } | null;
  } | null;
  _count?: { likes?: number; scores?: number; comments?: number };
  likes?: { id: string }[];
  songPlays?: { count: number }[];
  analysisData?: unknown;
};

/**
 * Map a row to the client contract.
 *
 * The old list endpoint spread the Prisma row and hand-picked fields with
 * `any`, which is how `uploadedBy` — a user id — ended up in a response served
 * to anonymous visitors. Here the shape is declared once and the only identity
 * that leaves is the uploader's public display data.
 */
export function toSliceSong(
  row: SongRow,
  viewerId: string | null,
  options: { includeAnalysis?: boolean } = {},
): SliceSong {
  const display = resolveUserDisplay(
    (row.uploader ?? { name: null, image: null }) as Parameters<typeof resolveUserDisplay>[0],
  );
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    description: row.description,
    duration: row.duration,
    bpm: row.bpm ?? 0,
    coverUrl: row.coverUrl ? `/api/slice-it/songs/${row.id}/cover` : null,
    audioUrl: `/api/slice-it/songs/stream/${row.id}`,
    uploader: {
      id: row.uploader?.id ?? '',
      name: display.name || row.uploader?.username || 'Unknown',
      image: display.image ?? null,
    },
    isOwner: viewerId !== null && viewerId === row.uploadedBy,
    plays: row.plays ?? 0,
    likeCount: row._count?.likes ?? 0,
    scoreCount: row._count?.scores ?? 0,
    commentCount: row._count?.comments ?? 0,
    isLiked: Array.isArray(row.likes) ? row.likes.length > 0 : false,
    userPlays: Array.isArray(row.songPlays) ? (row.songPlays[0]?.count ?? 0) : 0,
    createdAt: row.createdAt.toISOString(),
    ...(options.includeAnalysis
      ? { analysisData: (row.analysisData as BeatMap | null) ?? null }
      : {}),
  };
}

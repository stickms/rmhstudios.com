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
import {
  deleteObject,
  getObject,
  getObjectRange,
  getObjectSize,
  putObject,
} from '@/lib/storage/s3.server';
import { audioContentTypeForFilename } from '@/lib/audio/transcode.server';
import { contentTypeForFilename } from '@/lib/storage/keys';
import { resolveUserDisplay } from '@/lib/user-display';
import { SONG_AUDIO_PREFIX, SONG_COVER_PREFIX } from './constants';
import type { Difficulty } from './constants';
import type { BeatMap, Lamp, Slice, SliceSong } from './types';

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

/**
 * Read a byte range of a song's audio.
 *
 * The point is that a seek costs the bytes it asks for. Reading the whole track
 * and slicing it — which is what the stream route did — makes a `Range:
 * bytes=0-1` cost a full 50 MB object GET and hold that 50 MB resident, at
 * whatever rate a caller cares to repeat it.
 *
 * Returns null for a legacy on-disk row (the caller falls back to the whole
 * file) or an unsatisfiable range.
 */
export async function readSongAudioRange(
  audioUrl: string,
  start: number,
  end: number,
): Promise<{
  body: Buffer;
  contentType: string;
  start: number;
  end: number;
  total: number;
} | null> {
  if (!isObjectKey(audioUrl)) return null;
  const range = await getObjectRange(audioUrl, start, end);
  if (!range) return null;
  return { ...range, contentType: audioContentTypeForFilename(audioUrl) };
}

/** Size of a song's audio without transferring it. */
export async function songAudioSize(audioUrl: string): Promise<number | null> {
  if (!isObjectKey(audioUrl)) return null;
  return getObjectSize(audioUrl);
}

/** Read a song's audio in full, from the object store or the legacy disk path. */
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
  /** L15 — the grouping key, so a card can link to the artist page. */
  artistKey: true,
  album: true,
  /** C3 — for the difficulty sort's badge; null on most of the library. */
  chartRating: true,
  /**
   * V8 — 64 small integers. Included here on purpose while `analysisData` is
   * excluded a few lines down: that is the whole reason the strip is a
   * separate column rather than something derived from the chart at read time.
   */
  densityStrip: true,
  /**
   * O3 — 'ready' | 'pending' | 'failed'. The library shows "Charting…" rather
   * than hiding a pending row: a song that vanishes for two minutes after
   * upload reads as a failed upload.
   */
  analysisState: true,
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

/* ─── Clear lamps (H8) ──────────────────────────────────────────────────── */

/** Best-to-worst, so `Math.max` over the indices picks the better lamp. */
const LAMP_RANK: Record<Lamp, number> = { none: 0, failed: 1, cleared: 2, fc: 3, perfect: 4 };

/**
 * The player's standing on one chart, in the genre's standard escalation.
 *
 * `null` in means "no row", which is `none` — never played. That is a different
 * fact from `failed` (played, and the chart won), and collapsing the two is what
 * makes a library page uninformative: "have I tried this?" and "did it beat
 * me?" are the two questions a lamp exists to answer.
 *
 * The flags are **client-declared** (see `ScoreSubmissionZ`), so this is a badge
 * and nothing more. Reading it is fine anywhere; ranking on it is not.
 */
export function lampOf(
  row: { isPerfect: boolean; isFullCombo: boolean; cleared: boolean } | null | undefined,
): Lamp {
  if (!row) return 'none';
  if (row.isPerfect) return 'perfect';
  if (row.isFullCombo) return 'fc';
  return row.cleared ? 'cleared' : 'failed';
}

/** The better of two lamps. */
export function bestLamp(a: Lamp, b: Lamp): Lamp {
  return LAMP_RANK[a] >= LAMP_RANK[b] ? a : b;
}

/**
 * The viewer-scoped joins a song read needs to answer "how did *I* do?".
 *
 * The likes/plays half of this was previously written inline at each call site
 * (`app/routes/api/slice-it/songs.ts` and `songs/$id.ts`), which is why the
 * lamp join could not simply be added to `songSelect`: `songSelect` is a static
 * object and every one of these clauses has to name the viewer. Bundling them
 * here means a caller adds one spread rather than three, and a fourth
 * viewer-scoped join later lands in one place instead of two.
 *
 * ```ts
 * select: { ...songSelect, ...viewerSongJoins(userId) }
 * ```
 *
 * Returns `{}` for an anonymous viewer, so the call site never branches.
 */
export function viewerSongJoins(viewerId: string | null) {
  if (!viewerId) return {} as const;
  return {
    likes: { where: { userId: viewerId }, select: { id: true } },
    songPlays: { where: { userId: viewerId }, select: { count: true } },
    // Bounded by construction: one row per (difficulty, modPool) the viewer has
    // played, so at most 4 x 3 per song even for someone who has played every
    // board. No `take` is needed and adding one would silently hide a lamp.
    scores: {
      where: { userId: viewerId },
      select: { difficulty: true, cleared: true, isFullCombo: true, isPerfect: true },
    },
  } as const;
}

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
  artistKey?: string | null;
  album: string | null;
  chartRating?: number | null;
  densityStrip?: unknown;
  analysisState?: string | null;
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
  /** The viewer's own leaderboard rows, from `viewerSongJoins`. */
  scores?: { difficulty: string; cleared: boolean; isFullCombo: boolean; isPerfect: boolean }[];
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
    ...lampsFor(row.scores),
    createdAt: row.createdAt.toISOString(),
    // O3 — narrowed rather than passed through: the column is a VarChar so a
    // hand-written UPDATE could put anything in it, and a client switching on
    // an unknown state would silently render nothing.
    analysisState:
      row.analysisState === 'pending' || row.analysisState === 'failed'
        ? row.analysisState
        : 'ready',
    ...(options.includeAnalysis
      ? { analysisData: (row.analysisData as BeatMap | null) ?? null }
      : {}),
  };
}

/**
 * Collapse the viewer's leaderboard rows into one overall lamp plus a per-tier
 * breakdown.
 *
 * A song's headline lamp is the **best** across every tier, not the most recent
 * and not the one on the tier they happen to be looking at: "I have full-combo'd
 * this" is a fact about the player and the song, and losing it because they went
 * back and failed an Expert run would be a strange thing for a library to do.
 * The per-tier map is there for a card that wants to draw the escalation.
 *
 * Absent `scores` — an anonymous viewer, or a caller that did not spread
 * `viewerSongJoins` — is `'none'`, which is also the honest answer: we do not
 * know how it went.
 */
function lampsFor(
  rows: SongRow['scores'],
): Pick<SliceSong, 'lamp'> & Partial<Pick<SliceSong, 'lampByDifficulty'>> {
  if (!Array.isArray(rows) || rows.length === 0) return { lamp: 'none' };

  const byDifficulty: Partial<Record<Difficulty, Lamp>> = {};
  let overall: Lamp = 'none';
  for (const row of rows) {
    const lamp = lampOf(row);
    overall = bestLamp(overall, lamp);
    const tier = row.difficulty as Difficulty;
    byDifficulty[tier] = bestLamp(byDifficulty[tier] ?? 'none', lamp);
  }
  return { lamp: overall, lampByDifficulty: byDifficulty };
}

/* ─── Chart preview density (V8) ─────────────────────────────────────────── */

/**
 * A note-density histogram over a chart's duration, as a fixed number of
 * evenly-spaced buckets.
 *
 * 64 numbers — small enough to ride in a LIST response, which is the entire
 * point of computing this instead of shipping the chart: `songSelect` above
 * excludes `analysisData` because it is hundreds of kilobytes, and sending it
 * just to animate a hover strip would undo exactly that.
 */
export function densityStrip(
  notes: Pick<Slice, 'time'>[],
  duration: number,
  buckets = 64,
): number[] {
  const out = new Array<number>(buckets).fill(0);
  if (!(duration > 0) || notes.length === 0) return out;

  for (const note of notes) {
    const bucket = Math.min(buckets - 1, Math.max(0, Math.floor((note.time / duration) * buckets)));
    out[bucket]++;
  }
  const peak = Math.max(1, ...out);
  return out.map((v) => Math.round((v / peak) * 255));
}

/**
 * The density strip for one song, computed from its stored chart, or `null`
 * when there is nothing to chart from.
 *
 * Deliberately takes `analysisData` rather than a song id: computing this
 * needs the chart in memory regardless, and a function that fetched its own
 * copy would tempt a list-response caller into fetching `analysisData` per
 * row just to feed it — the one thing this feature exists to avoid.
 *
 * Not wired into any response yet. Doing that without shipping the chart
 * itself needs either a persisted column (computed once, at chart-generation
 * time, and added to `songSelect`) or a small per-song endpoint backed by a
 * cache — both touch files outside this wave's ownership. See
 * `docs/_handoff/presentation-requests.md`. This is the pure half of that
 * feature, ready for whichever path lands it.
 */
export function songDensityStrip(
  analysisData: Pick<BeatMap, 'slices'> | null | undefined,
  duration: number,
  difficulty: Difficulty = 'normal',
): number[] | null {
  if (!analysisData?.slices) return null;
  const { slices } = analysisData;

  let notes: Slice[] | undefined;
  if (Array.isArray(slices)) {
    notes = slices;
  } else {
    // Fall back to whichever tier actually has notes — an empty requested
    // tier (not only a missing one) should not read as "nothing to chart".
    const requested = slices[difficulty];
    notes =
      requested && requested.length > 0
        ? requested
        : Object.values(slices).find((tier) => tier.length > 0);
  }

  if (!notes || notes.length === 0) return null;
  return densityStrip(notes, duration);
}

/**
 * Narrow a stored `densityStrip` JSON value back to the array the client
 * contract promises.
 *
 * `Json?` in Prisma is `JsonValue`, which is "anything" — a row written by an
 * older version of this code, or by hand, could hold a string or an object. A
 * malformed strip renders as no strip, which is a supported state; letting it
 * through as `unknown[]` and having the component index into it is not.
 */
export function readDensityStrip(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
  return value as number[];
}

/**
 * The three library-only fields that hang off a row but are not part of
 * `SliceSong`.
 *
 * A helper rather than three spreads at each call site: the list route, the
 * artist page and the pack read all build a `LibrarySong`, and the one that
 * forgets `artistKey` is the one whose artist links silently stop working.
 */
export function libraryFieldsOf(row: SongRow): {
  artistKey: string | null;
  chartRating: number | null;
  densityStrip?: number[];
} {
  const strip = readDensityStrip(row.densityStrip);
  return {
    artistKey: row.artistKey ?? null,
    chartRating: row.chartRating ?? null,
    ...(strip ? { densityStrip: strip } : {}),
  };
}

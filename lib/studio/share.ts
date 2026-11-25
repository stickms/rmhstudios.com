/**
 * The pure half of sharing a Studio project (feature 07): the copy that is shared, and the copy a visitor opens.
 *
 * - `sanitizeForShare` runs on the SERVER's own copy of the cloud project. Every audio clip keeps its place on the
 *   timeline but loses its `bufferId` (a device sample id) and its `name` (often the sample's file name), and an audio
 *   track loses its name too (a track is often named for its sample): there is no built-in sample library, so every
 *   sample lives on the sharer's device and none of it is shared. MIDI track names stay: they are not file names.
 * - `copyFromShare` turns a read share into a project of the opener's own, with fresh project, track and clip ids so
 *   the copy never collides with the original or with another copy.
 *
 * Plain functions, no Prisma and no zod; the server and the client both use them.
 */
import type { Clip, Project, Track } from '@/lib/studio/types';

/** At most this many live (not revoked) shares per member. */
export const MAX_LIVE_SHARES = 20;

export { SHARE_TOKEN_PATTERN } from '@/lib/studio/share-token';

/** The project id every shared snapshot carries: the account project's own id is never part of a share. */
export const SHARED_PROJECT_ID = 'shared';

/** The shape both the zod-validated project and the editor's `Project` satisfy. */
export interface ShareableProject {
  clips: Record<string, { type: string }>;
  /** The tracks, when the project has them: an audio track's name is emptied like an audio clip's. */
  tracks?: { type: string; name: string }[];
}

export interface SanitizedShare<P> {
  project: P;
  /** Audio clips that need a sample of the opener's own. */
  missingSamples: number;
}

/** Whether a clip is an audio clip (the only kind that names a sample). */
function isAudioClip(clip: { type: string }): clip is { type: 'audio'; bufferId: string; name: string } {
  return clip.type === 'audio';
}

/**
 * The copy to store: every audio clip's `bufferId` and `name` and every audio track's `name` emptied and the project id
 * replaced by a neutral one, everything else as it was. The input is not
 * changed. `missingSamples` counts every audio clip (an already empty one needs a sample too).
 */
export function sanitizeForShare<P extends ShareableProject>(project: P): SanitizedShare<P> {
  let missingSamples = 0;
  const clips: Record<string, unknown> = {};
  for (const [key, clip] of Object.entries(project.clips)) {
    if (isAudioClip(clip)) {
      missingSamples += 1;
      clips[key] = { ...clip, bufferId: '', name: '' };
    } else {
      clips[key] = clip;
    }
  }
  // The project's own id is the account project's id (a primary key on the sharer's account): never shared.
  const id = 'id' in project ? { id: SHARED_PROJECT_ID } : {};
  const tracks = project.tracks
    ? { tracks: project.tracks.map((track) => (track.type === 'audio' ? { ...track, name: '' } : track)) }
    : {};
  return { project: { ...project, ...id, ...tracks, clips } as P, missingSamples };
}

/** The audio clips of a project, for the "N clips need a sample" count before anything is shared. */
export function countAudioClips(clips: Record<string, { type: string }>): number {
  let count = 0;
  for (const clip of Object.values(clips)) if (isAudioClip(clip)) count += 1;
  return count;
}

/** The raw `?share=` value of a query string (at most 64 characters), or null. Not yet known to be a token. */
export function extractShareParam(search: string): string | null {
  const value = new URLSearchParams(search).get('share');
  return value !== null && value.length > 0 && value.length <= 64 ? value : null;
}

/** The same address without `?share=` (other parameters and the hash stay), as a path to hand `replaceState`. */
export function withoutShareParam(href: string): string {
  const url = new URL(href, 'https://studio.invalid');
  url.searchParams.delete('share');
  return `${url.pathname}${url.search}${url.hash}`;
}

export interface CopyOptions {
  /** The name of the copy; defaults to the shared project's. */
  name?: string;
  now?: number;
  /** Mints an id; defaults to `crypto.randomUUID`. */
  mintId?: () => string;
  /** The name of the nth audio track a share left unnamed (1-based); the caller translates it. */
  audioTrackName?: (n: number) => string;
}

/**
 * A project of the opener's own from a shared snapshot: fresh project id, track ids and clip ids (references between
 * them follow), new timestamps. Patterns, notes and plugin instances keep their ids: they are scoped to the project.
 */
export function copyFromShare(data: Project, options: CopyOptions = {}): Project {
  const mint = options.mintId ?? (() => crypto.randomUUID());
  const now = options.now ?? Date.now();
  const trackIds = new Map<string, string>();
  const clipIds = new Map<string, string>();
  for (const track of data.tracks) trackIds.set(track.id, mint());
  for (const key of Object.keys(data.clips)) clipIds.set(key, mint());
  const mapClip = (id: string) => clipIds.get(id) ?? id;
  const mapTrack = (id: string) => trackIds.get(id) ?? id;

  const audioTrackName = options.audioTrackName ?? ((n: number) => `Audio track ${n}`);
  let unnamedAudio = 0;
  const tracks: Track[] = data.tracks.map((track) => {
    // A share empties an audio track's name; the copy labels it "Audio track N", counting the unnamed ones.
    const unnamed = track.type === 'audio' && track.name.trim() === '';
    if (unnamed) unnamedAudio += 1;
    return {
      ...track,
      id: mapTrack(track.id),
      name: unnamed ? audioTrackName(unnamedAudio) : track.name,
      clipIds: track.clipIds.map(mapClip),
    };
  });
  const clips: Record<string, Clip> = {};
  for (const [key, clip] of Object.entries(data.clips)) {
    const id = mapClip(key);
    clips[id] = { ...clip, id, trackId: mapTrack(clip.trackId) };
  }
  return {
    ...data,
    id: mint(),
    name: options.name ?? data.name,
    tracks,
    clips,
    createdAt: now,
    updatedAt: now,
  };
}

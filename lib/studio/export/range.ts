/** What part of the project an export covers, and whether it is allowed. Pure. */
import { CHALLENGE_AUDIO_MAX_BYTES } from '../challenge/shared';

export const MAX_EXPORT_SECONDS = 600;
export const TAIL_SECONDS = 2;
export const WAV_HEADER_BYTES = 44;

export type ExportMode = 'song' | 'loop';
export type BitDepth = 16 | 24;

export interface RangeTrack {
  id: string;
  type: string;
  muted: boolean;
  soloed: boolean;
  clipIds: string[];
}

export interface RangeClip {
  type: string;
  startBeat: number;
  durationBeats: number;
}

export interface RangeInput {
  mode: ExportMode;
  bpm: number;
  tracks: RangeTrack[];
  clips: Record<string, RangeClip>;
  loopStart: number;
  loopEnd: number;
}

export type RangeRefusal = 'empty' | 'no-loop' | 'too-long';

export type ExportRange =
  | {
      ok: true;
      startBeat: number;
      endBeat: number;
      startSeconds: number;
      /** Audio length in seconds, tail included for a song. */
      durationSeconds: number;
    }
  | {
      ok: false;
      reason: RangeRefusal;
      durationSeconds: number;
    };

export const beatsToSeconds = (beats: number, bpm: number) => (beats * 60) / bpm;

/** Muted tracks are out; when any track is soloed only soloed tracks are in, as in playback. */
export function audibleTracks<T extends Pick<RangeTrack, 'muted' | 'soloed'>>(tracks: T[]): T[] {
  const anySolo = tracks.some((t) => t.soloed);
  return tracks.filter((t) => (anySolo ? t.soloed : !t.muted));
}

export function songBounds(
  tracks: RangeTrack[],
  clips: Record<string, RangeClip>,
): {
  startBeat: number;
  endBeat: number;
} | null {
  let start = Infinity;
  let end = -Infinity;
  for (const track of audibleTracks(tracks)) {
    for (const id of track.clipIds) {
      const clip = clips[id];
      if (!clip || clip.type === 'automation' || !(clip.durationBeats > 0)) continue;
      start = Math.min(start, clip.startBeat);
      end = Math.max(end, clip.startBeat + clip.durationBeats);
    }
  }
  return Number.isFinite(start) && end > start
    ? {
        startBeat: Math.max(0, start),
        endBeat: end,
      }
    : null;
}

export function exportRange(input: RangeInput): ExportRange {
  const bpm = Math.max(1, input.bpm);
  let startBeat: number;
  let endBeat: number;
  let tail = 0;
  if (input.mode === 'loop') {
    if (!(input.loopEnd > input.loopStart))
      return {
        ok: false,
        reason: 'no-loop',
        durationSeconds: 0,
      };
    startBeat = input.loopStart;
    endBeat = input.loopEnd;
  } else {
    const bounds = songBounds(input.tracks, input.clips);
    if (!bounds)
      return {
        ok: false,
        reason: 'empty',
        durationSeconds: 0,
      };
    startBeat = bounds.startBeat;
    endBeat = bounds.endBeat;
    tail = TAIL_SECONDS;
  }
  const durationSeconds = beatsToSeconds(endBeat - startBeat, bpm) + tail;
  if (durationSeconds > MAX_EXPORT_SECONDS)
    return {
      ok: false,
      reason: 'too-long',
      durationSeconds,
    };
  return {
    ok: true,
    startBeat,
    endBeat,
    startSeconds: beatsToSeconds(startBeat, bpm),
    durationSeconds,
  };
}

/** The size of the WAV file for a length, in bytes (stereo unless said otherwise). */
export function wavBytes(durationSeconds: number, sampleRate: number, bitDepth: BitDepth, channels = 2): number {
  const frames = Math.ceil(durationSeconds * sampleRate);
  return WAV_HEADER_BYTES + frames * channels * (bitDepth / 8);
}

/** Whether a 16-bit render of this length fits the challenge upload's limit. */
export function challengeFit(
  durationSeconds: number,
  sampleRate: number,
  limit = CHALLENGE_AUDIO_MAX_BYTES,
): {
  bytes: number;
  fits: boolean;
} {
  const bytes = wavBytes(durationSeconds, sampleRate, 16);
  return {
    bytes,
    fits: bytes <= limit,
  };
}

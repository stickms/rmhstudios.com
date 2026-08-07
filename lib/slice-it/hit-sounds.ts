/**
 * Slice It — hit sound sets and the ceiling on uploaded samples.
 *
 * `V2`. A hit sound is not a music file that happens to be short: it is decoded
 * into memory up front and played hundreds of times per run, so the interesting
 * part of this module is the validation, not the list.
 *
 * Client-safe — the same constants gate the settings UI and the upload route,
 * and having them disagree is how a player picks a sample the server then
 * rejects.
 */

import type { HitResult } from './constants';

/**
 * 256 KB and 2 seconds.
 *
 * The duration bound is the real one. A 2-second sample at 48 kHz stereo is
 * ~768 KB of Float32 PCM held for the whole run, per variant — six variants is
 * already 4.5 MB, and that is the budget. The byte bound is what stops the
 * feature being used as free audio hosting.
 */
export const HIT_SOUND_MAX_BYTES = 256 * 1024;
export const HIT_SOUND_MAX_SECONDS = 2;

/** How many custom samples one member may hold. */
export const HIT_SOUND_MAX_PER_USER = 12;

/**
 * A hit sound set: one sample per judgement, all optional.
 *
 * Per-judgement variants are a genuine feedback channel — a distinct
 * `MARVELOUS` tick tells the player they are inside the tightest window while
 * their eyes are on the notes, which is the only place a timing signal can
 * usefully arrive mid-run. `null` falls back to `base`.
 */
export interface HitSoundSet {
  id: string;
  label: string;
  category: string;
  /** Played for any judgement without its own variant. */
  base: string;
  variants: Partial<Record<Exclude<HitResult, 'NONE'>, string>>;
  /** Set for uploaded sets; stock sets are `null`. */
  ownerId: string | null;
}

const stock = (
  id: string,
  label: string,
  category: string,
  variants: HitSoundSet['variants'] = {},
): HitSoundSet => ({ id, label, category, base: `${id}.wav`, variants, ownerId: null });

export const STOCK_HIT_SOUND_SETS: HitSoundSet[] = [
  // `default` is the synthesised click the engine already makes with no file at
  // all. Kept first, and kept file-less, so a player whose network drops still
  // has hit feedback.
  { id: 'default', label: 'Default', category: 'Stock', base: '', variants: {}, ownerId: null },
  stock('soft-clap', 'Soft clap', 'Stock'),
  stock('wood', 'Wood block', 'Stock'),
  stock('snare', 'Snare', 'Stock'),
  stock('rim', 'Rimshot', 'Stock'),
  stock('tick', 'Tick', 'Minimal'),
  stock('click', 'Click', 'Minimal'),
  stock('drop', 'Drop', 'Minimal'),
  // The graded sets are the point of `variants`: same family, brighter sample
  // the tighter the window.
  stock('graded-bell', 'Bell (graded)', 'Graded', {
    MARVELOUS: 'graded-bell-marvelous.wav',
    PERFECT: 'graded-bell-perfect.wav',
    GREAT: 'graded-bell-great.wav',
  }),
  stock('graded-clap', 'Clap (graded)', 'Graded', {
    MARVELOUS: 'graded-clap-marvelous.wav',
    PERFECT: 'graded-clap-perfect.wav',
  }),
];

export function resolveHitSoundSet(
  id: string | null | undefined,
  custom: HitSoundSet[] = [],
): HitSoundSet {
  if (!id) return STOCK_HIT_SOUND_SETS[0];
  return (
    custom.find((set) => set.id === id) ??
    STOCK_HIT_SOUND_SETS.find((set) => set.id === id) ??
    STOCK_HIT_SOUND_SETS[0]
  );
}

/**
 * The file a judgement should play, or `null` for the synthesised default.
 *
 * `MISS` deliberately never resolves to a sample. A miss already has its own
 * feedback (`H2`), and a hit sound on a miss is the single most confusing thing
 * this system could do.
 */
export function sampleForJudgement(
  set: HitSoundSet,
  judgement: Exclude<HitResult, 'NONE'>,
): string | null {
  if (judgement === 'MISS') return null;
  return set.variants[judgement] || set.base || null;
}

/** Every distinct file a set needs preloaded before the countdown ends. */
export function preloadList(set: HitSoundSet): string[] {
  const files = [set.base, ...Object.values(set.variants)].filter(Boolean) as string[];
  return [...new Set(files)];
}

/* ─── Upload validation ──────────────────────────────────────────────────── */

export type HitSoundRejection =
  | { ok: true }
  | { ok: false; reason: 'too-large' | 'too-long' | 'unreadable' | 'quota'; message: string };

/**
 * Gate an uploaded sample.
 *
 * Takes the probed duration rather than the buffer, so this stays client-safe
 * and the caller keeps using `lib/audio/probe.ts` — the same
 * duration-before-decode reasoning that module documents applies here at a
 * smaller scale, and re-implementing it with a decoder would reintroduce
 * exactly the allocation bomb it was written to close.
 *
 * A `null` duration is a refusal, not a pass: every format the upload route
 * accepts is one the prober can read, so unreadable means "not that format".
 */
export function validateHitSound(input: {
  byteLength: number;
  durationSec: number | null;
  existingCount: number;
}): HitSoundRejection {
  if (input.existingCount >= HIT_SOUND_MAX_PER_USER) {
    return {
      ok: false,
      reason: 'quota',
      message: `You can keep ${HIT_SOUND_MAX_PER_USER} custom hit sounds. Delete one first.`,
    };
  }
  if (input.byteLength > HIT_SOUND_MAX_BYTES) {
    return {
      ok: false,
      reason: 'too-large',
      message: `Hit sounds are capped at ${Math.round(HIT_SOUND_MAX_BYTES / 1024)} KB.`,
    };
  }
  if (input.durationSec === null) {
    return { ok: false, reason: 'unreadable', message: 'That file could not be read as audio.' };
  }
  if (input.durationSec > HIT_SOUND_MAX_SECONDS) {
    return {
      ok: false,
      reason: 'too-long',
      message: `Hit sounds are capped at ${HIT_SOUND_MAX_SECONDS} seconds.`,
    };
  }
  return { ok: true };
}

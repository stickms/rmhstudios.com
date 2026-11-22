/**
 * Turns the microphone's per-frame pitch guesses into note on/off events. A
 * raw pitch detector flickers (harmonics, breath, the odd octave slip), so a
 * note only starts once it has held for a few frames and only ends after a
 * few silent ones; a different note replaces the sounding one only after it
 * has itself held. Pure and client-safe: the adapter supplies frames and
 * timestamps, this file makes every decision, so it is the part under test.
 *
 * **Re-attack (opt-in).** The same pitch struck again while it still rings is,
 * by the rules above, one long note: nothing new starts until it has been
 * silent for {@link OFF_FRAMES} frames. A song asks for repeated notes (E E E),
 * so the songs screen turns on `reattack`: a level rise of at least 6 dB
 * ({@link REATTACK_RISE}, ×2 in amplitude) within {@link REATTACK_WINDOW_MS}
 * after the level had decayed to half its peak or less, on the same pitch, ends
 * the note and starts it again. It is off by default, so every other lesson
 * (the pitch match counts a try per note-on) behaves exactly as before; a frame
 * without a level never re-attacks.
 */
import type { NoteEvent } from './events';

/** Consecutive identical frames before a note (or a change of note) counts. */
const ON_FRAMES = 3;
/** Consecutive empty frames before the sounding note is released. */
const OFF_FRAMES = 4;
const MIC_VELOCITY = 0.8;
/** How quickly the level must rise again for a re-attack (ms). */
export const REATTACK_WINDOW_MS = 80;
/** By how much (amplitude ratio; 2 = 6 dB) it must rise. */
export const REATTACK_RISE = 2;
/** A re-attack comes at least this long after the note started (ms), so a tremolo cannot stutter. */
export const REATTACK_MIN_MS = 120;
/** Levels remembered for the window (25 ms frames). */
const RING = 6;

export interface PitchFrame {
  midi: number;
  cents: number;
  /** The frame's level (RMS); only re-attack reads it. */
  rms?: number;
}

export interface SegmenterOptions {
  /** Whether a re-attack starts the same pitch again (read on every frame). Off when absent. */
  reattack?: () => boolean;
}

export interface Segmenter {
  /**
   * Feed one analysis frame (null = no clear pitch); returns events it caused.
   * The frame is read, never kept, so the caller may reuse one object; the
   * common "nothing happened" answer is one shared empty array (no allocation
   * per frame at the 25 ms poll).
   */
  push(frame: PitchFrame | null, time: number): readonly NoteEvent[];
  /** Release the sounding note, if any (used when the mic is switched off). */
  flush(time: number): readonly NoteEvent[];
}

const NONE: readonly NoteEvent[] = Object.freeze([]);

export function createSegmenter(opts: SegmenterOptions = {}): Segmenter {
  let active: number | null = null;
  let candidate: number | null = null;
  let candidateCount = 0;
  let silentCount = 0;
  // Re-attack: the sounding note's start, its peak level, and its recent levels (a fixed ring).
  let startedAt = 0;
  let peak = 0;
  const ringTime = new Float64Array(RING);
  const ringLevel = new Float64Array(RING);
  let ringNext = 0;
  let ringSize = 0;

  const off = (midi: number, time: number): NoteEvent => ({
    type: 'off',
    midi,
    velocity: MIC_VELOCITY,
    time,
    source: 'mic',
  });
  const on = (midi: number, time: number, cents: number): NoteEvent => ({
    type: 'on',
    midi,
    velocity: MIC_VELOCITY,
    time,
    source: 'mic',
    cents,
  });
  const begin = (time: number, rms: number | undefined) => {
    startedAt = time;
    peak = rms ?? 0;
    ringSize = 0;
    ringNext = 0;
    if (rms !== undefined) remember(time, rms);
  };
  const remember = (time: number, rms: number) => {
    ringTime[ringNext] = time;
    ringLevel[ringNext] = rms;
    ringNext = (ringNext + 1) % RING;
    ringSize = Math.min(RING, ringSize + 1);
  };
  /** The lowest level heard within the window before `time`, or Infinity. */
  const recentLow = (time: number) => {
    let low = Infinity;
    for (let i = 0; i < ringSize; i++) {
      if (time - (ringTime[i] ?? 0) <= REATTACK_WINDOW_MS) low = Math.min(low, ringLevel[i] ?? Infinity);
    }
    return low;
  };

  return {
    push(frame, time) {
      if (frame === null) {
        candidate = null;
        candidateCount = 0;
        if (active === null) return NONE;
        silentCount++;
        if (silentCount < OFF_FRAMES) return NONE;
        const ended = active;
        active = null;
        silentCount = 0;
        return [off(ended, time)];
      }
      silentCount = 0;
      if (frame.midi === active) {
        candidate = null;
        candidateCount = 0;
        const rms = frame.rms;
        if (opts.reattack?.() && rms !== undefined && Number.isFinite(rms)) {
          const low = recentLow(time);
          const struck =
            time - startedAt >= REATTACK_MIN_MS && rms >= REATTACK_RISE * low && low <= peak / REATTACK_RISE;
          if (struck) {
            begin(time, rms);
            return [off(frame.midi, time), on(frame.midi, time, frame.cents)];
          }
          peak = Math.max(peak, rms);
          remember(time, rms);
        }
        return NONE;
      }
      if (frame.midi === candidate) candidateCount++;
      else {
        candidate = frame.midi;
        candidateCount = 1;
      }
      if (candidateCount < ON_FRAMES) return NONE;
      const events: NoteEvent[] = [];
      if (active !== null) events.push(off(active, time));
      events.push(on(frame.midi, time, frame.cents));
      active = frame.midi;
      candidate = null;
      candidateCount = 0;
      begin(time, frame.rms);
      return events;
    },
    flush(time) {
      const ended = active;
      active = null;
      candidate = null;
      candidateCount = 0;
      silentCount = 0;
      return ended === null ? NONE : [off(ended, time)];
    },
  };
}

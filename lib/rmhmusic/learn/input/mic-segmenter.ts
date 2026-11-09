/**
 * Turns the microphone's per-frame pitch guesses into note on/off events. A
 * raw pitch detector flickers (harmonics, breath, the odd octave slip), so a
 * note only starts once it has held for a few frames and only ends after a
 * few silent ones; a different note replaces the sounding one only after it
 * has itself held. Pure and client-safe: the adapter supplies frames and
 * timestamps, this file makes every decision, so it is the part under test.
 */
import type { NoteEvent } from './events';

/** Consecutive identical frames before a note (or a change of note) counts. */
const ON_FRAMES = 3;
/** Consecutive empty frames before the sounding note is released. */
const OFF_FRAMES = 4;
const MIC_VELOCITY = 0.8;

export interface PitchFrame {
  midi: number;
  cents: number;
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

export function createSegmenter(): Segmenter {
  let active: number | null = null;
  let candidate: number | null = null;
  let candidateCount = 0;
  let silentCount = 0;

  const off = (midi: number, time: number): NoteEvent => ({
    type: 'off',
    midi,
    velocity: MIC_VELOCITY,
    time,
    source: 'mic',
  });

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
      events.push({
        type: 'on',
        midi: frame.midi,
        velocity: MIC_VELOCITY,
        time,
        source: 'mic',
        cents: frame.cents,
      });
      active = frame.midi;
      candidate = null;
      candidateCount = 0;
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

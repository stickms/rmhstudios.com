/**
 * Notes played one after another (an interval, a tune) or all together (a chord), built on
 * {@link playNote} and timers: no scheduling on the audio clock, since a lesson only needs the
 * order to be heard, and `cancel` must be able to stop a sequence the learner has left behind.
 *
 * Callers say what to play and nothing about how it sounds (`PlayOptions` may later carry an
 * instrument). Each note is let go `holdMs` after it starts. Client-only.
 *
 * `started` is false when nothing sounded because sound is not ready (no Web Audio, closed, or
 * still suspended until a tap): the caller shows its "sound isn't playing" path (`soundStatus`,
 * `wakeSound` in `voice.ts`) and never counts the question as heard. A sequence that did start
 * is stopped with `cancel`, safe to call twice.
 */
import { playNote, soundStatus, type PlayOptions } from './voice';

/** How long one note of a melody sounds. */
export const DEFAULT_HOLD_MS = 700;
/** How long a chord rings. */
export const CHORD_HOLD_MS = 1400;

export interface SequenceOptions extends PlayOptions {
  holdMs?: number;
}

export interface PlayingSequence {
  /** Whether the sound started (false: not ready, nothing will play). */
  readonly started: boolean;
  /** Stop: later notes never start and sounding ones are released. Safe to call twice. */
  cancel(): void;
}

const NOT_STARTED: PlayingSequence = { started: false, cancel: () => {} };

export function playSequence(
  midis: readonly number[],
  gapMs: number,
  opts: SequenceOptions = {},
): PlayingSequence {
  if (soundStatus() !== 'ready') return NOT_STARTED;
  const { holdMs = DEFAULT_HOLD_MS, ...voice } = opts;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const releases = new Set<() => void>();
  let cancelled = false;

  const start = (midi: number) => {
    const release = playNote(midi, voice);
    releases.add(release);
    const timer = setTimeout(() => {
      timers.delete(timer);
      releases.delete(release);
      release();
    }, holdMs);
    timers.add(timer);
  };

  midis.forEach((midi, i) => {
    if (!Number.isFinite(midi)) return;
    const delay = i * Math.max(0, gapMs);
    if (delay <= 0) {
      start(midi);
      return;
    }
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!cancelled) start(midi);
    }, delay);
    timers.add(timer);
  });

  return {
    started: true,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const release of releases) release();
      releases.clear();
    },
  };
}

/** All the notes at once. */
export function playChord(midis: readonly number[], opts: SequenceOptions = {}): PlayingSequence {
  return playSequence(midis, 0, { holdMs: CHORD_HOLD_MS, ...opts });
}

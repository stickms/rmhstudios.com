/**
 * Notes played one after another (an interval, a tune) or all together (a chord), built on
 * {@link playNote} and timers: no scheduling on the audio clock, since a lesson only needs the
 * order to be heard, and `cancel` must be able to stop a sequence the learner has left behind.
 *
 * Callers say what to play and nothing about how it sounds (`PlayOptions` may later carry an
 * instrument). Each note is let go `holdMs` after it *starts*.
 *
 * **When a note has started is the voice's word, not ours.** `playNote` reports it through
 * `PlayOptions.onStart`: the synth does it during the call, a sampled instrument after its samples
 * are decoded. Everything here keys off that report, so a load delay is never counted as heard:
 * - the hold timer of a note starts when that note starts;
 * - the next note of an interval is asked for `gapMs` after the previous one started;
 * - `onNoteStart(i)` fires as each note starts, and `onAllStarted` once the LAST has — the moment
 *   the learner has heard the whole question (an interval's second note, a chord's last voice).
 *   It is not the end of the ringing. A cancelled sequence reports nothing more.
 *
 * `started` is false when nothing sounded because sound is not ready (no Web Audio, closed, or
 * still suspended until a tap) or there is no note to play: the caller shows its "sound isn't
 * playing" path (`soundStatus`, `wakeSound` in `voice.ts`) and never counts the question as heard.
 * A sequence that did start is stopped with `cancel`, safe to call twice.
 */
import { playNote, soundStatus, type PlayOptions } from './voice';

/**
 * How long one note of a melody sounds (ms). The synth's value: a sampled instrument passes its
 * own `holdMs` in {@link SequenceOptions} (its notes ring and decay differently).
 */
export const DEFAULT_HOLD_MS = 700;
/** How long a chord rings (ms). The synth's value; an instrument may pass its own `holdMs`. */
export const CHORD_HOLD_MS = 1400;
/**
 * Between the start of an interval's first note and its second (ms). One value for every sound
 * today; a slower-decaying instrument may need a wider gap, passed as `gapMs` by the caller.
 */
export const INTERVAL_GAP_MS = 750;

export interface SequenceOptions extends PlayOptions {
  holdMs?: number;
  /** Note `index` (of the notes that are numbers) has started sounding. */
  onNoteStart?: (index: number) => void;
  /** Every note has started: the whole sound has been heard. Once; never after `cancel`. */
  onAllStarted?: () => void;
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
  const { holdMs = DEFAULT_HOLD_MS, onNoteStart, onAllStarted, ...voice } = opts;
  const notes = midis.filter(Number.isFinite);
  if (notes.length === 0) return NOT_STARTED;
  const gap = Math.max(0, gapMs);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const releases = new Set<() => void>();
  let cancelled = false;
  let begun = 0;

  /** Ask for note `i`; everything else happens when the voice says it has started. */
  const request = (i: number) => {
    let release: () => void = () => {};
    let once = false;
    // One handle for the note whether it is let go by its hold or by `cancel`.
    const letGo = () => {
      releases.delete(letGo);
      release();
    };
    releases.add(letGo);
    release = playNote(notes[i], {
      ...voice,
      onStart: () => {
        if (cancelled || once) return;
        once = true;
        begun++;
        const hold = setTimeout(() => {
          timers.delete(hold);
          letGo();
        }, holdMs);
        timers.add(hold);
        onNoteStart?.(i);
        if (begun === notes.length) onAllStarted?.();
        else if (gap > 0 && i + 1 < notes.length) {
          const next = setTimeout(() => {
            timers.delete(next);
            if (!cancelled) request(i + 1);
          }, gap);
          timers.add(next);
        }
      },
    });
  };

  if (gap > 0) request(0);
  else notes.forEach((_, i) => request(i));

  return {
    started: true,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const letGo of [...releases]) letGo();
      releases.clear();
    },
  };
}

/** All the notes at once. */
export function playChord(midis: readonly number[], opts: SequenceOptions = {}): PlayingSequence {
  return playSequence(midis, 0, { holdMs: CHORD_HOLD_MS, ...opts });
}

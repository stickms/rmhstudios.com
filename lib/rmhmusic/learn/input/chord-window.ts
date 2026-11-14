/**
 * Collecting a chord: the notes of one chord arrive as separate `on` events, a few tens of
 * milliseconds apart. The first note opens a window of {@link CHORD_WINDOW_MS}; notes that arrive
 * inside it (by their own `performance.now()` times) are the chord; later ones are late. Pure.
 *
 * **Keys already down count.** The window tracks which keys are held, from the `on` and `off`
 * events it is fed. When it opens, the pitches still held are part of the chord, so a learner who
 * keeps C down from the C chord and presses F and A has played F major (C, F, A). A held note is
 * dropped only by its own `off` (per source: one pitch held on two inputs stays until both let
 * go). The rule for a note that does not belong is the same: it counts, and the learner must let
 * go of it. A carried-over note let go before the window closes does not count (that is the hand
 * moving to the new chord); a note pressed inside the window counts even if it is let go again.
 *
 * `createChordCollector` adds the one timer and the "too few notes" rule the lesson needs: a window
 * that closes with fewer than three pitch classes is a lone tap, not an answer.
 *
 * Only notes from the on-screen keys, the computer keys and MIDI count. The microphone hears one
 * note at a time, so it can never play a chord; its notes are ignored here (the lesson says so
 * and offers to switch input, and never marks a microphone player wrong).
 */
import { isChordAttempt } from '../theory/chords';
import type { NoteEvent } from './events';

/** From the first note: the time the others have to arrive. */
export const CHORD_WINDOW_MS = 600;

export type WindowNote =
  Pick<
    NoteEvent,
    | 'type'
    | 'midi'
    | 'time'
    | 'source'
  >;

export type PushResult =
  | 'opened'
  | 'added'
  | 'late'
  | 'ignored';

export interface ChordWindow {
  /**
   * Feed every note event, also while the lesson is not listening (`collect: false`: a dialog is
   * open or the answer is showing), so held keys stay known. `opened`: start the timer; `late`:
   * after the window, not collected.
   */
  push(
    e: WindowNote,
    collect?: boolean,
  ): PushResult;
  /** The chord (carried-over holds still down, then the notes pressed), and close the window. */
  take(): number[];
  /** Forget the open window. Keys still held stay held. */
  reset(): void;
  /** Forget the held keys too (the input changed, so their `off` may never come). */
  releaseAll(): void;
}

export function createChordWindow(
  windowMs = CHORD_WINDOW_MS,
): ChordWindow {
  /** `source:midi` of every key down, in the order they went down. */
  const held =
    new Map<
      string,
      number
    >();
  let start:
    | number
    | null =
    null;
  /** Pitches that were already held when the window opened. */
  let carried: number[] =
    [];
  /** Pitches pressed since it opened. */
  let pressed: number[] =
    [];

  const isHeld =
    (
      midi: number,
    ) =>
      [
        ...held.values(),
      ].includes(
        midi,
      );
  const close =
    () => {
      start =
        null;
      carried =
        [];
      pressed =
        [];
    };

  return {
    push(
      e,
      collect = true,
    ) {
      if (
        e.source ===
        'mic'
      )
        return 'ignored';
      if (
        !Number.isFinite(
          e.midi,
        )
      )
        return 'ignored';
      const key = `${e.source}:${e.midi}`;
      if (
        e.type ===
        'off'
      ) {
        held.delete(
          key,
        );
        return 'ignored';
      }
      if (
        e.type !==
          'on' ||
        !Number.isFinite(
          e.time,
        )
      )
        return 'ignored';
      const before =
        [
          ...new Set(
            held.values(),
          ),
        ];
      if (
        !held.has(
          key,
        )
      )
        held.set(
          key,
          e.midi,
        );
      if (
        !collect
      )
        return 'ignored';
      if (
        start ===
        null
      ) {
        start =
          e.time;
        carried =
          before.filter(
            (
              m,
            ) =>
              m !==
              e.midi,
          );
        pressed =
          [
            e.midi,
          ];
        return 'opened';
      }
      if (
        e.time -
          start >=
        windowMs
      )
        return 'late';
      if (
        !pressed.includes(
          e.midi,
        )
      )
        pressed.push(
          e.midi,
        );
      return 'added';
    },
    take() {
      const out =
        [
          ...carried.filter(
            isHeld,
          ),
          ...pressed,
        ];
      close();
      return out;
    },
    reset:
      close,
    releaseAll() {
      held.clear();
      close();
    },
  };
}

export interface ChordCollector {
  /** Feed every note event; `listening` is false while a dialog is open or the answer is showing. */
  feed(
    e: WindowNote,
    listening: boolean,
  ): void;
  /** Drop the open window and its timer (a new chord, a dialog, leaving). Held keys stay held. */
  cancel(): void;
  /** Cancel, and forget the held keys. */
  releaseAll(): void;
}

/**
 * The window plus its timer. When the window closes: three or more pitch classes are an attempt
 * (`onAttempt`, to be graded); fewer are a lone tap (`onTooFew`: not graded, the prompt stays and
 * the next note opens a fresh window, still counting any key that is held).
 */
export function createChordCollector({
  onAttempt,
  onTooFew,
  windowMs = CHORD_WINDOW_MS,
}: {
  onAttempt: (
    midis: number[],
  ) => void;
  onTooFew: (
    midis: number[],
  ) => void;
  windowMs?: number;
}): ChordCollector {
  const win =
    createChordWindow(
      windowMs,
    );
  let timer: ReturnType<
    typeof setTimeout
  > | null =
    null;
  const stop =
    () => {
      if (
        timer !==
        null
      )
        clearTimeout(
          timer,
        );
      timer =
        null;
    };
  return {
    feed(
      e,
      listening,
    ) {
      if (
        win.push(
          e,
          listening,
        ) !==
        'opened'
      )
        return;
      stop();
      timer =
        setTimeout(
          () => {
            timer =
              null;
            const midis =
              win.take();
            if (
              isChordAttempt(
                midis,
              )
            )
              onAttempt(
                midis,
              );
            else
              onTooFew(
                midis,
              );
          },
          windowMs,
        );
    },
    cancel() {
      stop();
      win.reset();
    },
    releaseAll() {
      stop();
      win.releaseAll();
    },
  };
}

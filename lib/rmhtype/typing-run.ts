/**
 * Keystroke accounting for one lesson run.
 *
 * Pure and client-safe. The caller passes a timestamp with every key (from
 * `performance.now()`), so there is no timer and no frame loop: elapsed time is the
 * difference between the first and the latest keystroke, and nothing re-renders
 * except on input.
 *
 * ## Rules
 *
 * - A character key always advances. A wrong one stays on screen, marked wrong,
 *   until Backspace removes it; the run ends when the text is full.
 * - Speed is the standard net rule: correct characters in the final text, divided
 *   by five, over the minutes from the first to the last keystroke.
 * - Accuracy is keystrokes, not final text: every wrong character struck counts
 *   against you even if you corrected it, so deleting is never free. Backspaces
 *   are counted separately and are not keystrokes for accuracy.
 * - Per-key timings go through `createKeyStatAccumulator` (`keystats.ts`), the one
 *   collector the key statistics use. It records against the key the text asked
 *   for, so a miss is charged to the key you needed, and it keeps counters rather
 *   than a keystroke log (see the privacy note there).
 */

import {
  createKeyStatAccumulator,
  type KeyStatAggregate,
} from '@/lib/rmhtype/keystats';

/** The fastest a person can type, as the progress endpoint bounds it. */
export const MAX_WPM = 250;

export interface MissedKey {
  key: string;
  errors: number;
}

export interface TypingRunResult {
  /** Net words per minute, one decimal, at most {@link MAX_WPM}. */
  wpm: number;
  /** Percent of keystrokes that were right, one decimal. 100 when nothing was typed. */
  accuracy: number;
  correctChars: number;
  keystrokes: number;
  errorKeystrokes: number;
  backspaces: number;
  elapsedMs: number;
  /** Aggregates for the key statistics contract. */
  keyStats: KeyStatAggregate[];
  /** The keys missed most, worst first. */
  missed: MissedKey[];
}

export interface TypingRun {
  readonly text: string;
  /** Characters typed so far, wrong ones included. */
  typed(): string;
  /** True once the text is full. */
  done(): boolean;
  /** Type one character at `at` (ms). Ignored once done. */
  type(
    char: string,
    at: number,
  ): void;
  /** Remove the last character. Counted; ignored on an empty line or once the run is done. */
  backspace(
    at: number,
  ): void;
  /** Percent of keystrokes right so far (100 before the first). */
  liveAccuracy(): number;
  result(): TypingRunResult;
}

const round1 =
  (
    value: number,
  ) =>
    Math.round(
      value *
        10,
    ) /
    10;

export function createTypingRun(
  text: string,
): TypingRun {
  const typed: string[] =
    [];
  const stats =
    createKeyStatAccumulator();
  let startedAt:
    | number
    | null =
    null;
  let lastAt = 0;
  let keystrokes = 0;
  let errorKeystrokes = 0;
  let backspaces = 0;

  const accuracy =
    () =>
      keystrokes ===
      0
        ? 100
        : round1(
            ((keystrokes -
              errorKeystrokes) /
              keystrokes) *
              100,
          );

  return {
    text,
    typed:
      () =>
        typed.join(
          '',
        ),
    done: () =>
      typed.length >=
      text.length,
    type(
      char,
      at,
    ) {
      if (
        typed.length >=
        text.length
      )
        return;
      const expected =
        text.charAt(
          typed.length,
        );
      const correct =
        char ===
        expected;
      // The first key has no gap before it: the clock starts on it.
      const gap =
        startedAt ===
        null
          ? 0
          : at -
            lastAt;
      if (
        startedAt ===
        null
      )
        startedAt =
          at;
      lastAt =
        at;
      keystrokes += 1;
      if (
        !correct
      )
        errorKeystrokes += 1;
      typed.push(
        char,
      );
      stats.record(
        expected,
        gap,
        correct,
      );
    },
    backspace(
      at,
    ) {
      if (
        typed.length ===
          0 ||
        typed.length >=
          text.length
      )
        return;
      if (
        startedAt !==
        null
      )
        lastAt =
          at;
      typed.pop();
      backspaces += 1;
    },
    liveAccuracy:
      accuracy,
    result() {
      let correctChars = 0;
      for (const [
        i,
        char,
      ] of typed.entries())
        if (
          char ===
          text.charAt(
            i,
          )
        )
          correctChars += 1;
      const elapsedMs =
        startedAt ===
        null
          ? 0
          : Math.max(
              0,
              lastAt -
                startedAt,
            );
      const minutes =
        elapsedMs /
        60_000;
      const wpm =
        minutes >
        0
          ? Math.min(
              MAX_WPM,
              round1(
                correctChars /
                  5 /
                  minutes,
              ),
            )
          : 0;
      const keyStats =
        stats.snapshot();
      return {
        wpm,
        accuracy:
          accuracy(),
        correctChars,
        keystrokes,
        errorKeystrokes,
        backspaces,
        elapsedMs,
        keyStats,
        missed:
          keyStats
            .filter(
              (
                stat,
              ) =>
                stat.errors >
                0,
            )
            .sort(
              (
                a,
                b,
              ) =>
                b.errors -
                  a.errors ||
                a.key.localeCompare(
                  b.key,
                ),
            )
            .slice(
              0,
              5,
            )
            .map(
              (
                stat,
              ) => ({
                key: stat.key,
                errors:
                  stat.errors,
              }),
            ),
      };
    },
  };
}

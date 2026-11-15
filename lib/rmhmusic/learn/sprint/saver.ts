/**
 * Where a sight reading result goes. The game talks only to this interface, so storing results
 * (plan task S5: a freeplay best per level, one scored daily result per user per UTC date) replaces
 * `createMemorySaver` with an API-backed saver in one file.
 *
 * What a save carries: the run's summary AND every prompt's result (so the server can recompute
 * the score from the per-prompt times rather than trust a summary), and, for the daily challenge,
 * the UTC date the run was DEALT on (`utcDate` when the learner pressed Start), never the date it
 * ended. A run started at 23:59 UTC belongs to that day.
 *
 * Contract for S5's server (record it with the endpoint):
 * - **Dates.** Accept a dealt date only if it is today's UTC date, or yesterday's within a short
 *   grace window after midnight (e.g. 10 minutes) for a run that straddled it. Never relabel a
 *   result to another date; outside the window, answer `invalid`.
 * - **One scored run per user per date.** A second scored daily save for the same date answers
 *   `already-scored` (another tab or device got there first) and keeps the stored one; a retried
 *   POST of the same run is idempotent and answers `saved`.
 * - **"Started" tracking.** The first completed run is the scored one, so a learner could abandon
 *   bad runs before they finish. If that matters, record a daily start (POST on Start) and let only
 *   the first started run score; this client sends nothing on Start yet. Decide in S5.
 * - Outcomes map to the machine: `saved`, `unauthorized` (signed out), `failed`/`invalid` (Retry),
 *   `already-scored`; `unsaved` is only this placeholder's answer.
 *
 * Until then nothing is stored: every save answers `unsaved` (the game says plainly the result was
 * not saved), and only this visit remembers that today's challenge was played, so a replay the same
 * day is practice. `dailyDone` may reject (a network failure, with a real saver): the screen catches
 * it and says so. Client-safe; no network here.
 */
import type { SprintSaveOutcome } from './machine';
import type { SprintLevelId } from './levels';
import type {
  PromptResult,
  RunSummary,
} from './scoring';

export interface SprintSaveInput {
  summary: RunSummary;
  /** Every prompt's result, in the order asked (skipped chords included, marked `skipped`). */
  results: readonly PromptResult[];
}

export interface SprintSaver {
  /** Keep a freeplay run (the server keeps the best per level). */
  saveFreeplay(
    input: SprintSaveInput & {
      level: SprintLevelId;
    },
  ): Promise<SprintSaveOutcome>;
  /**
   * Keep the day's scored challenge run. `date` is the UTC date the run was dealt on; may answer
   * `already-scored` (the date already has its scored run) or `failed`.
   */
  saveDaily(
    input: SprintSaveInput & {
      date: string;
    },
  ): Promise<SprintSaveOutcome>;
  /**
   * Whether the date already has its scored run (later runs that day are practice). Rejects when
   * it cannot tell; the caller must catch.
   */
  dailyDone(
    date: string,
  ): Promise<boolean>;
}

export function createMemorySaver(): SprintSaver {
  const daily =
    new Set<string>();
  return {
    saveFreeplay:
      () =>
        Promise.resolve(
          'unsaved',
        ),
    saveDaily:
      ({
        date,
      }) => {
        if (
          daily.has(
            date,
          )
        )
          return Promise.resolve(
            'already-scored',
          );
        daily.add(
          date,
        );
        return Promise.resolve(
          'unsaved',
        );
      },
    dailyDone:
      (
        date,
      ) =>
        Promise.resolve(
          daily.has(
            date,
          ),
        ),
  };
}

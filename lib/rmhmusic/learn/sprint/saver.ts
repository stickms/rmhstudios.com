/**
 * Where a sight reading result goes. The game talks only to this interface: `createApiSaver` is
 * the real one (plan task S5), `createMemorySaver` keeps nothing and is for tests and previews.
 *
 * What a save carries: the run's summary AND every prompt's result, so the server recomputes the
 * score from the per-prompt times rather than trust a summary (`record.ts`), and, for the daily
 * challenge, the UTC date the run was DEALT on (`utcDate` when the run was dealt), never the date
 * it ended. A run started at 23:59 UTC belongs to that day.
 *
 * The server's contract (`sprint.server.ts`, `record.ts`):
 * - **Dates.** A dealt date is accepted only if it is today's UTC date, or yesterday's within a
 *   10-minute grace window after midnight (`DATE_GRACE_MS`) for a run that straddled it. It is
 *   never relabelled; outside the window the save answers `invalid` (400).
 * - **One scored run per user per date.** A second scored daily save for the same date answers
 *   `already-scored` and keeps the stored one; a retried POST of the same run answers `saved`.
 * - **"Started" tracking.** The scored run is recorded when it starts (`startDaily`, sent when
 *   the learner presses Start on a scored daily run). The date then reads `started`, so a run
 *   abandoned before it ends cannot be dealt again for a better score: later runs that day are
 *   practice. The start is best effort (a failed one does not stop the run; the save makes the
 *   row itself).
 * - Outcomes map to the machine: `saved`, `unauthorized` (401, signed out), `invalid` (400) and
 *   `failed` (anything else; Retry), `already-scored`. `unsaved` is only the memory saver's answer.
 *
 * `dailyDone` and `overview` may reject (a network failure): the screen catches it and says so.
 */
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import type { DailyBoardMe } from '@/lib/rmhmusic/social/social.contract';
import {
  activityDurationMs,
  endActivity,
} from '../activity-clock';
import type { SprintSaveOutcome } from './machine';
import type { SprintLevelId } from './levels';
import type {
  PromptResult,
  RunSummary,
} from './scoring';
import {
  sprintDailyApi,
  sprintDailyStartApi,
  sprintFreeplayApi,
  sprintOverviewApi,
  type SprintOverview,
} from './sprint.contract';

export type { SprintOverview };

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
      /** Where the saved run stands on the Daily board, when the server says (Phase 6). */
      onBoard?: (
        board: DailyBoardMe,
      ) => void;
    },
  ): Promise<SprintSaveOutcome>;
  /** The scored daily run of `date` has started (best effort; never rejects). */
  startDaily(
    date: string,
  ): Promise<void>;
  /**
   * Whether the date already has its scored run, finished or started (later runs that day are
   * practice). Rejects when it cannot tell; the caller must catch.
   */
  dailyDone(
    date: string,
  ): Promise<boolean>;
  /** The learner's bests per level, `date`'s challenge state and the daily streak. May reject. */
  overview(
    date: string,
  ): Promise<SprintOverview>;
}

/** A failed call as a save outcome. */
function failure(
  err: unknown,
): SprintSaveOutcome {
  if (
    err instanceof
    HttpError
  ) {
    if (
      err.status ===
      401
    )
      return 'unauthorized';
    if (
      err.status ===
      400
    )
      return 'invalid';
  }
  return 'failed';
}

export function createApiSaver(): SprintSaver {
  const overview =
    (
      date: string,
    ) =>
      api(
        sprintOverviewApi,
        {
          query:
            {
              date,
            },
        },
      );
  return {
    saveFreeplay:
      async ({
        level,
        results,
      }) => {
        try {
          const durationMs =
            activityDurationMs();
          await api(
            sprintFreeplayApi,
            {
              body: {
                level,
                results,
                ...(durationMs ===
                undefined
                  ? {}
                  : {
                      durationMs,
                    }),
              },
            },
          );
          endActivity();
          return 'saved';
        } catch (err) {
          return failure(
            err,
          );
        }
      },
    saveDaily:
      async ({
        date,
        results,
        onBoard,
      }) => {
        try {
          const durationMs =
            activityDurationMs();
          const res =
            await api(
              sprintDailyApi,
              {
                body: {
                  date,
                  results,
                  ...(durationMs ===
                  undefined
                    ? {}
                    : {
                        durationMs,
                      }),
                },
              },
            );
          endActivity();
          if (
            res.board &&
            onBoard
          )
            onBoard(
              res.board,
            );
          return res.outcome;
        } catch (err) {
          return failure(
            err,
          );
        }
      },
    startDaily:
      async (
        date,
      ) => {
        try {
          await api(
            sprintDailyStartApi,
            {
              body: {
                date,
              },
            },
          );
        } catch {
          // Best effort: the save creates the row itself.
        }
      },
    dailyDone:
      async (
        date,
      ) =>
        (
          await overview(
            date,
          )
        )
          .daily !==
        'open',
    overview,
  };
}

/** Keeps nothing (tests and previews): every save answers `unsaved`; only this visit's daily runs are remembered. */
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
    startDaily:
      () =>
        Promise.resolve(),
    dailyDone:
      (
        date,
      ) =>
        Promise.resolve(
          daily.has(
            date,
          ),
        ),
    overview:
      (
        date,
      ) =>
        Promise.resolve(
          {
            bests:
              [],
            daily:
              daily.has(
                date,
              )
                ? 'scored'
                : 'open',
            streak: 0,
          },
        ),
  };
}

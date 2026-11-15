/**
 * Where a sight reading result goes. The game talks only to this interface, so storing results
 * (plan task S5: a freeplay best per level, one scored daily result per user per UTC date, the
 * server deciding the date) replaces `createMemorySaver` with an API-backed saver in one file.
 *
 * Until then nothing is stored: every save answers `unsaved` (the game says plainly that the
 * result was not saved), and only this visit remembers that today's challenge was played, so a
 * replay the same day is practice. Client-safe; no network here.
 */
import type { SprintSaveOutcome } from './machine';
import type { SprintLevelId } from './levels';
import type { RunSummary } from './scoring';

export interface SprintSaver {
  /** Keep a freeplay run (the server keeps the best per level). */
  saveFreeplay(input: {
    level: SprintLevelId;
    summary: RunSummary;
  }): Promise<SprintSaveOutcome>;
  /** Keep the day's scored challenge run (`date` from `utcDate`; the server's date wins). */
  saveDaily(input: {
    date: string;
    summary: RunSummary;
  }): Promise<SprintSaveOutcome>;
  /** Whether the day's challenge already has its scored run (later runs that day are practice). */
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

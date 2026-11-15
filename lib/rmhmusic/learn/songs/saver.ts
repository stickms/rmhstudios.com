/**
 * Where a song's result goes. The screen talks only to this interface: `createApiSongSaver` is the
 * real one, `createMemorySongSaver` keeps nothing (tests and previews).
 *
 * A save carries every note's result, never a score: the server re-scores the run
 * (`scoring.ts` `checkSongRun`) and keeps the best per song per mode. Outcomes map to the machine:
 * `saved` (with the best now kept), `unauthorized` (401), `invalid` (400), `failed` (anything else;
 * Retry) and `unsaved` (the memory saver). `bests` may reject; the caller catches it.
 */
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import type { SongSaveOutcome } from './machine';
import type { SongRunRecord } from './scoring';
import {
  songBestApi,
  songBestsApi,
  type SongBest,
} from './songs.contract';

export type { SongBest };

export interface SongSaveResult {
  outcome: SongSaveOutcome;
  /** The best now kept for this song and mode (only when saved). */
  bestScore?: number;
}

export interface SongSaver {
  save(
    songId: string,
    run: SongRunRecord,
  ): Promise<SongSaveResult>;
  bests(): Promise<
    SongBest[]
  >;
}

function failure(
  err: unknown,
): SongSaveResult {
  if (
    err instanceof
    HttpError
  ) {
    if (
      err.status ===
      401
    )
      return {
        outcome:
          'unauthorized',
      };
    if (
      err.status ===
      400
    )
      return {
        outcome:
          'invalid',
      };
  }
  return {
    outcome:
      'failed',
  };
}

export function createApiSongSaver(): SongSaver {
  return {
    save: async (
      songId,
      run,
    ) => {
      try {
        const res =
          await api(
            songBestApi,
            {
              body: {
                songId,
                run,
              },
            },
          );
        return {
          outcome:
            'saved',
          bestScore:
            res
              .best
              .bestScore,
        };
      } catch (err) {
        return failure(
          err,
        );
      }
    },
    bests:
      async () =>
        (
          await api(
            songBestsApi,
          )
        )
          .bests,
  };
}

export function createMemorySongSaver(): SongSaver {
  return {
    save: () =>
      Promise.resolve(
        {
          outcome:
            'unsaved',
        },
      ),
    bests:
      () =>
        Promise.resolve(
          [],
        ),
  };
}

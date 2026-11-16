/**
 * RMH Music's social reads as route-seeded queries (redesign audit B4, `lib/route/route-query.ts`).
 * The `/rmhmusic/daily` loader awaits `dailyBoardQuery` for the page's day and the Everyone tab;
 * the page reads the same options, so a tab or day it has not seen yet is a new key and is read
 * then. A write that changes who is on a board invalidates `DAILY_BOARD_KEY`.
 */
import { contractQuery } from '@/lib/route/route-query';
import {
  dailyBoardApi,
  musicSocialApi,
  type BoardScope,
} from './social.contract';

/** Every Daily board query starts with this; invalidate it to re-read whichever is on screen. */
export const DAILY_BOARD_KEY =
  [
    'rmhmusic',
    'daily-board',
  ] as const;

/** One date's board, Everyone or Friends. */
export const dailyBoardQuery =
  (
    date: string,
    scope: BoardScope,
  ) =>
    contractQuery(
      [
        ...DAILY_BOARD_KEY,
        date,
        scope,
      ],
      dailyBoardApi,
      {
        query:
          {
            date,
            scope,
          },
      },
    );

/** The learner's two switches (the same key the Privacy page's group reads and writes). */
export const musicSocialQuery =
  () =>
    contractQuery(
      [
        'rmhmusic',
        'social',
      ],
      musicSocialApi,
    );

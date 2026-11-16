/**
 * RMH Music's social reads as route-seeded queries (redesign audit B4, `lib/route/route-query.ts`).
 * The `/rmhmusic/daily`, `/rmhmusic/friends` and shared-result loaders prefetch these, and the
 * components read the same options with `useQuery`. A tab or day a page has not seen yet is a new
 * key and is read then. A write that changes who is on a board invalidates `DAILY_BOARD_KEY`; the
 * switches share their key with the Privacy page's group (`MusicPrivacyControls`), so a change in
 * one place is the same cached value in the other.
 */
import { contractQuery } from '@/lib/route/route-query';
import type { FriendsLimit } from '@/lib/rmhmusic/learn/social/friends';
import { friendsApi } from './friends.contract';
import {
  listSharesApi,
  sharedResultApi,
} from './share.contract';
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
export const MUSIC_SOCIAL_KEY =
  [
    'rmhmusic',
    'social',
  ] as const;

export const musicSocialQuery =
  () =>
    contractQuery(
      MUSIC_SOCIAL_KEY,
      musicSocialApi,
      undefined,
      {
        staleTime: 30_000,
      },
    );

export const musicFriendsQuery =
  (
    limit: FriendsLimit,
  ) =>
    contractQuery(
      [
        'rmhmusic',
        'friends',
        limit,
      ],
      friendsApi,
      {
        query:
          {
            limit,
          },
      },
      {
        staleTime: 30_000,
      },
    );

/** The learner's live shared links (Friends and sharing). */
export const musicSharesQuery =
  () =>
    contractQuery(
      [
        'rmhmusic',
        'shares',
      ],
      listSharesApi,
      undefined,
      {
        staleTime: 15_000,
      },
    );

/** A shared result's public page. */
export const musicSharedResultQuery =
  (
    token: string,
  ) =>
    contractQuery(
      [
        'rmhmusic',
        'shared',
        token,
      ],
      sharedResultApi,
      {
        params:
          {
            token,
          },
      },
      {
        staleTime: 60_000,
      },
    );

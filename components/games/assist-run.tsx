import { useCallback } from 'react';
import {
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  api,
  apiQuery,
} from '@/lib/contract/client';
import { getAssistsApi } from '@/lib/game/assist.contract';
import { startAssistRunApi } from '@/lib/game/assist-run.contract';
import {
  hasAnyAssist,
  NO_ASSISTS,
  type AssistProfile,
} from '@/lib/game/assist';

/**
 * The game-side half of the assist layer (P7), shared by every adopting game.
 *
 * A game calls `start()` when a run begins and applies the profile it gets
 * back; the server records the claim that keeps an assisted run off the board.
 * Signed-out players never call it and play the ranked profile.
 */

/** Ask the server for this run's profile. Any failure is the ranked profile: the server still unranks on submit. */
export function useAssistRun(
  gameId: string,
  signedIn: boolean,
) {
  const mutation =
    useMutation(
      {
        mutationFn:
          () =>
            api(
              startAssistRunApi,
              {
                params:
                  {
                    gameId,
                  },
              },
            ),
      },
    );
  const {
    mutateAsync,
  } =
    mutation;
  const start =
    useCallback(async (): Promise<AssistProfile> => {
      if (
        !signedIn
      )
        return NO_ASSISTS;
      try {
        return (
          await mutateAsync()
        )
          .profile;
      } catch {
        return NO_ASSISTS;
      }
    }, [
      signedIn,
      mutateAsync,
    ]);
  return start;
}

/** Whether the member's stored assists are on, for the start screen. False while loading and for guests. */
export function useAssistsOn(
  signedIn: boolean,
): boolean {
  const {
    data,
  } =
    useQuery(
      {
        ...apiQuery(
          getAssistsApi,
        ),
        enabled:
          signedIn,
      },
    );
  return Boolean(
    data &&
    hasAnyAssist(
      data.assists,
    ),
  );
}

/** One line on the start screen when assists are on, with the way to the settings page. */
export function AssistStartNotice({
  signedIn,
  className,
}: {
  signedIn: boolean;
  className?: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'game-assists',
    );
  const on =
    useAssistsOn(
      signedIn,
    );
  if (
    !on
  )
    return null;
  return (
    <p
      className={
        className
      }
      role="status"
      data-testid="assist-start-notice"
    >
      {t(
        'start-notice',
        {
          defaultValue:
            'Assists on: this run will not be ranked.',
        },
      )}{' '}
      <Link
        to="/settings/game-assists"
        className="underline"
      >
        {t(
          'start-notice-link',
          {
            defaultValue:
              'Change assists',
          },
        )}
      </Link>
    </p>
  );
}

export { parseRanked, NotRankedNote } from './assist-run-island';

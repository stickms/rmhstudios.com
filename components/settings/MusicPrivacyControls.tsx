import { useId } from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { toast } from '@/lib/toast';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { api } from '@/lib/contract/client';
import {
  musicSocialApi,
  setMusicSocialApi,
  type MusicSocial,
} from '@/lib/rmhmusic/learn/social/social.contract';

const QUERY_KEY =
  [
    'rmhmusic',
    'social',
  ] as const;

/**
 * The RMH Music group of the Privacy page (Phase 6, plan 1.1): the same two switches the app shows,
 * on the same endpoint (`/api/rmhmusic/social`), so every visibility setting can be found in one
 * place. Both are off until the member turns them on; turning one off hides every past and present
 * appearance at once and deletes nothing.
 */
export function MusicPrivacyControls() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const queryClient =
    useQueryClient();
  const {
    data,
    isPending,
  } =
    useQuery(
      {
        queryKey:
          QUERY_KEY,
        queryFn:
          () =>
            api(
              musicSocialApi,
              {},
            ),
      },
    );
  const value: MusicSocial =
    data ?? {
      board: false,
      friends: false,
    };
  const loaded =
    !isPending &&
    data !==
      undefined;
  const boardHelp =
    useId();
  const friendsHelp =
    useId();

  function persist(body: {
    board?: boolean;
    friends?: boolean;
  }) {
    // Shown at once; a failed save puts the switch back and says so.
    const previous =
      value;
    queryClient.setQueryData(
      QUERY_KEY,
      {
        ...value,
        ...body,
      },
    );
    api(
      setMusicSocialApi,
      {
        body,
      },
    )
      .then(
        (
          next,
        ) =>
          queryClient.setQueryData(
            QUERY_KEY,
            next,
          ),
      )
      .catch(
        () => {
          queryClient.setQueryData(
            QUERY_KEY,
            previous,
          );
          toast.error(
            t(
              'music-privacy-save-error',
              {
                defaultValue:
                  'Could not save',
              },
            ),
          );
        },
      );
  }

  return (
    <SettingsSection
      title={t(
        'music-privacy-title',
        {
          defaultValue:
            'RMH Music',
        },
      )}
      description={t(
        'music-privacy-subtitle',
        {
          defaultValue:
            'Who sees your sight reading scores and your progress. Both are off until you turn them on.',
        },
      )}
    >
      <div className="chrome-row flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-site-text">
            {t(
              'music-privacy-board',
              {
                defaultValue:
                  'Show my Daily challenge scores on the board',
              },
            )}
          </p>
          <p
            id={
              boardHelp
            }
            className="text-xs text-site-text-muted"
          >
            {t(
              'music-privacy-board-hint',
              {
                defaultValue:
                  'Signed-in learners see your name, picture and score. Off hides every day at once.',
              },
            )}
          </p>
        </div>
        <Switch
          checked={
            value.board
          }
          disabled={
            !loaded
          }
          onCheckedChange={(
            on,
          ) =>
            persist(
              {
                board:
                  on,
              },
            )
          }
          aria-label={t(
            'music-privacy-board',
            {
              defaultValue:
                'Show my Daily challenge scores on the board',
            },
          )}
          aria-describedby={
            boardHelp
          }
        />
      </div>
      <div className="chrome-row flex items-center justify-between gap-3 border-t border-site-border pt-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-site-text">
            {t(
              'music-privacy-friends',
              {
                defaultValue:
                  'Share my progress with friends',
              },
            )}
          </p>
          <p
            id={
              friendsHelp
            }
            className="text-xs text-site-text-muted"
          >
            {t(
              'music-privacy-friends-hint',
              {
                defaultValue:
                  'People you follow who follow you back see your Daily streak, finished units and song bests. Friends stop seeing it within a minute of turning it off.',
              },
            )}
          </p>
        </div>
        <Switch
          checked={
            value.friends
          }
          disabled={
            !loaded
          }
          onCheckedChange={(
            on,
          ) =>
            persist(
              {
                friends:
                  on,
              },
            )
          }
          aria-label={t(
            'music-privacy-friends',
            {
              defaultValue:
                'Share my progress with friends',
            },
          )}
          aria-describedby={
            friendsHelp
          }
        />
      </div>
    </SettingsSection>
  );
}

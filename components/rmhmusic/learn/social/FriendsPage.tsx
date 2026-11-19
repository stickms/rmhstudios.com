/**
 * Friends and sharing (RMH Music Phase 6, plan 1.1 and 1.5): `/rmhmusic/friends`.
 *
 * The learner's two switches with what each one shows and to whom, then the friends who share
 * their progress (mutual follows with their own switch on): a name and an avatar, the Daily
 * challenge streak, finished units and, folded in a native `<details>`, song bests. Rows on rules
 * in the notebook look; no chips or badges. The page's data comes from the route loader
 * (`social.queries.ts`); a switch change refetches the friends list, nothing polls. The page
 * has no primary button (R4).
 *
 * A friend row has no stable key: the response carries no account id on purpose, and a name is
 * neither unique nor fixed. Rows are keyed by position within one fetch (`dataUpdatedAt:index`),
 * so a refetch remounts them and closes any open song bests rather than leaving one friend's list
 * open under another friend's name.
 */
import {
  useId,
  useRef,
  useState,
} from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { api } from '@/lib/contract/client';
import type { FriendProgress } from '@/lib/rmhmusic/social/friends.contract';
import {
  DAILY_BOARD_KEY,
  MUSIC_SOCIAL_KEY,
  musicFriendsQuery,
  musicSocialQuery,
} from '@/lib/rmhmusic/social/social.queries';
import {
  setMusicSocialApi,
  type MusicSocial,
} from '@/lib/rmhmusic/social/social.contract';
import { TEXT_BUTTON } from '../buttons';
import { Shell } from '../LessonScreen';
import { learnerName } from './board-text';
import { SharedLinks } from './SharedLinks';
import {
  friendDailyLine,
  friendSongLine,
  friendUnitsLine,
} from './friends-text';

type SwitchKey =
  | 'board'
  | 'friends';

export function FriendsPage() {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const queryClient =
    useQueryClient();
  const social =
    useQuery(
      musicSocialQuery(),
    );
  const friends =
    useQuery(
      musicFriendsQuery(
        100,
      ),
    );
  const value: MusicSocial =
    social.data ?? {
      board: false,
      friends: false,
    };
  const loaded =
    social.data !==
    undefined;
  const [
    pending,
    setPending,
  ] =
    useState<
      Record<
        SwitchKey,
        boolean
      >
    >(
      {
        board: false,
        friends: false,
      },
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );
  // Saves go out in the order they were tapped (the last tap wins).
  const queue =
    useRef<
      Promise<void>
    >(
      Promise.resolve(),
    );
  const boardHelp =
    useId();
  const friendsHelp =
    useId();

  function persist(
    key: SwitchKey,
    on: boolean,
  ) {
    setFailed(
      false,
    );
    setPending(
      (
        p,
      ) => ({
        ...p,
        [key]: true,
      }),
    );
    const set =
      (
        v: boolean,
      ) =>
        queryClient.setQueryData<MusicSocial>(
          MUSIC_SOCIAL_KEY,
          (
            old,
          ) => ({
            ...(old ??
              value),
            [key]:
              v,
          }),
        );
    set(
      on,
    );
    queue.current =
      queue.current
        .then(
          () =>
            api(
              setMusicSocialApi,
              {
                body: {
                  [key]:
                    on,
                },
              },
            ),
        )
        .then(
          (
            next,
          ) => {
            queryClient.setQueryData(
              MUSIC_SOCIAL_KEY,
              next,
            );
            // The viewer's own friends switch decides whether they see friends at all, here and
            // on the Daily board's Friends tab.
            void queryClient.invalidateQueries(
              {
                queryKey:
                  [
                    'rmhmusic',
                    'friends',
                  ],
              },
            );
            void queryClient.invalidateQueries(
              {
                queryKey:
                  DAILY_BOARD_KEY,
              },
            );
          },
        )
        .catch(
          () => {
            set(
              !on,
            );
            setFailed(
              true,
            );
          },
        )
        .finally(
          () =>
            setPending(
              (
                p,
              ) => ({
                ...p,
                [key]: false,
              }),
            ),
        );
  }

  const list =
    friends.data;
  return (
    <Shell
      title={t(
        'friends-title',
        {
          defaultValue:
            'Friends and sharing',
        },
      )}
      busy={
        friends.isPending
      }
    >
      <p className="text-base leading-6 text-app-text-muted">
        {t(
          'friends-about',
          {
            defaultValue:
              'Friends are people you follow who follow you back. Nothing here is shown to anyone until you turn it on.',
          },
        )}
      </p>

      <section className="rmm-sheet divide-y divide-app-border">
        <SwitchRow
          id={`${boardHelp}-switch`}
          helpId={
            boardHelp
          }
          label={t(
            'social-board-label',
            {
              defaultValue:
                'Show my Daily challenge scores on the board',
            },
          )}
          help={t(
            'social-board-help',
            {
              defaultValue:
                'Signed-in learners see your name, picture and score. Off hides every day at once.',
            },
          )}
          checked={
            value.board
          }
          disabled={
            !loaded ||
            pending.board
          }
          onChange={(
            on,
          ) =>
            persist(
              'board',
              on,
            )
          }
        />
        <SwitchRow
          id={`${friendsHelp}-switch`}
          helpId={
            friendsHelp
          }
          label={t(
            'social-friends-label',
            {
              defaultValue:
                'Share my progress with friends',
            },
          )}
          help={t(
            'social-friends-help',
            {
              defaultValue:
                "Friends see your Daily challenge streak, finished units and song bests, and your Daily scores on the board's Friends tab. You see theirs while this is on. Friends stop seeing yours within a minute of turning it off.",
            },
          )}
          checked={
            value.friends
          }
          disabled={
            !loaded ||
            pending.friends
          }
          onChange={(
            on,
          ) =>
            persist(
              'friends',
              on,
            )
          }
        />
        {failed ? (
          <p
            role="status"
            className="px-4 py-3 text-sm leading-5 text-app-danger"
          >
            {t(
              'board-switch-failed',
              {
                defaultValue:
                  "Couldn't save. Try again.",
              },
            )}
          </p>
        ) : null}
      </section>

      <section
        className="space-y-2"
        aria-labelledby={`${friendsHelp}-heading`}
      >
        <h2
          id={`${friendsHelp}-heading`}
          className="rmm-display text-2xl leading-8 text-app-text"
        >
          {t(
            'friends-heading',
            {
              defaultValue:
                'Friends',
            },
          )}
        </h2>
        {friends.isPending ? (
          <div>
            <p
              role="status"
              className="sr-only"
            >
              {t(
                'friends-loading',
                {
                  defaultValue:
                    'Loading your friends…',
                },
              )}
            </p>
            <ul
              aria-hidden="true"
              className="rmm-sheet divide-y divide-app-border"
            >
              {[
                0,
                1,
                2,
              ].map(
                (
                  i,
                ) => (
                  <li
                    key={
                      i
                    }
                    className="flex gap-3 px-4 py-3"
                  >
                    <span className="h-10 w-10 shrink-0 rounded-full bg-app-surface-hover" />
                    <span className="flex-1 space-y-1">
                      <span className="block h-6 py-1">
                        <span className="block h-4 w-32 rounded-app-sm bg-app-surface-hover" />
                      </span>
                      <span className="block h-5 py-0.5">
                        <span className="block h-4 w-48 max-w-full rounded-app-sm bg-app-surface-hover" />
                      </span>
                      <span className="block h-5 py-0.5">
                        <span className="block h-4 w-40 max-w-full rounded-app-sm bg-app-surface-hover" />
                      </span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        ) : friends.isError ||
          !list ? (
          <div className="rmm-sheet space-y-2 p-4">
            <p className="text-app-text">
              {t(
                'friends-failed',
                {
                  defaultValue:
                    "Couldn't load your friends.",
                },
              )}
            </p>
            <button
              type="button"
              onClick={() =>
                void friends.refetch()
              }
              className={
                TEXT_BUTTON
              }
            >
              {t(
                'retry',
                {
                  defaultValue:
                    'Try again',
                },
              )}
            </button>
          </div>
        ) : !list.optedIn ? (
          <p className="rmm-sheet p-4 text-base leading-6 text-app-text-muted">
            {t(
              'friends-off',
              {
                defaultValue:
                  'You see friends who share their progress while you share yours.',
              },
            )}
          </p>
        ) : list
            .friends
            .length ===
          0 ? (
          <p className="rmm-sheet p-4 text-base leading-6 text-app-text-muted">
            {t(
              'friends-empty',
              {
                defaultValue:
                  'None of your friends share their progress yet. Friends are people you follow who follow you back.',
              },
            )}
          </p>
        ) : (
          <ul className="rmm-sheet divide-y divide-app-border">
            {list.friends.map(
              (
                f,
                i,
              ) => (
                <FriendRow
                  key={`${friends.dataUpdatedAt}:${i}`}
                  friend={
                    f
                  }
                />
              ),
            )}
          </ul>
        )}
      </section>

      <SharedLinks />
    </Shell>
  );
}

function SwitchRow({
  id,
  helpId,
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  helpId: string;
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  onChange: (
    on: boolean,
  ) => void;
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <label
          htmlFor={
            id
          }
          className="text-sm leading-5 font-medium text-app-text"
        >
          {
            label
          }
        </label>
        <p
          id={
            helpId
          }
          className="text-sm leading-5 text-app-text-muted"
        >
          {
            help
          }
        </p>
      </div>
      <Switch
        id={
          id
        }
        checked={
          checked
        }
        disabled={
          disabled
        }
        aria-describedby={
          helpId
        }
        onCheckedChange={
          onChange
        }
      />
    </div>
  );
}

function FriendRow({
  friend,
}: {
  friend: FriendProgress;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const name =
    learnerName(
      t,
      friend
        .user
        .name,
    );
  return (
    <li className="flex gap-3 px-4 py-3">
      <UserAvatar
        src={
          friend
            .user
            .image
        }
        alt=""
        size={
          40
        }
        fallbackName={
          name
        }
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base leading-6 text-app-text">
          {
            name
          }
        </p>
        <p className="text-sm leading-5 text-app-text-muted">
          {friendDailyLine(
            t,
            friend.daily,
          )}
        </p>
        <p className="text-sm leading-5 text-app-text-muted">
          {friendUnitsLine(
            t,
            friend.units,
          )}
        </p>
        {friend
          .songs
          .length >
        0 ? (
          <details className="group">
            <summary
              className={`${TEXT_BUTTON} cursor-pointer`}
            >
              {t(
                'friends-song-bests',
                {
                  count:
                    friend
                      .songs
                      .length,
                  defaultValue_one:
                    '{{count}} song best',
                  defaultValue:
                    '{{count}} song bests',
                },
              )}
            </summary>
            <ul className="divide-y divide-app-border">
              {friend.songs.map(
                (
                  s,
                ) => (
                  <li
                    key={`${s.songId}:${s.mode}`}
                    className="py-2 text-sm leading-5 text-app-text"
                  >
                    {friendSongLine(
                      t,
                      s,
                    )}
                  </li>
                ),
              )}
            </ul>
          </details>
        ) : null}
      </div>
    </li>
  );
}

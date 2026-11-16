/**
 * The sight reading Daily board (RMH Music Phase 6, plan 1.2 and 1.8): `/rmhmusic/daily`.
 *
 * Today's (live) or yesterday's board, Everyone or Friends, as rows on rules in the notebook look:
 * a place, an avatar, a name, the score and the mean time a note, "without chords" for a run that
 * skipped them. No medals, chips or badges; the top three look like every other row. The viewer's
 * own line says where their run stands, with the board switch beside it. Nothing polls: the board
 * is read on visit and on Refresh. The page has no primary button (R4).
 */
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { utcDate } from '@/lib/rmhmusic/learn/sprint/generate';
import {
  dailyBoardApi,
  musicSocialApi,
  setMusicSocialApi,
  type BoardScope,
  type DailyBoard as Board,
  type DailyBoardRow,
  type MusicSocial,
} from '@/lib/music-social/social.contract';
import { TEXT_BUTTON } from '../buttons';
import { Shell } from '../LessonScreen';
import {
  boardRowSentence,
  boardStatusSentence,
  learnerName,
  nextBoardLine,
  secondsANote,
} from './board-text';

// Lazy, as everywhere else it mounts: the dialog validates with the report route's zod schema.
const ReportDialog =
  lazy(
    () =>
      import('@/components/moderation/ReportDialog').then(
        (
          m,
        ) => ({
          default:
            m.ReportDialog,
        }),
      ),
  );

const DAY_MS = 86_400_000;
/** One row's height, shared by the skeleton so the list does not move when it arrives. */
const ROW =
  'flex h-14 items-center gap-3';

export type BoardDay =
  | 'today'
  | 'yesterday';

export function DailyBoard({
  day,
}: {
  day: BoardDay;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const [
    now,
  ] =
    useState(
      () =>
        Date.now(),
    );
  const date =
    utcDate(
      day ===
        'today'
        ? now
        : now -
            DAY_MS,
    );
  const [
    scope,
    setScope,
  ] =
    useState<BoardScope>(
      'everyone',
    );
  const [
    board,
    setBoard,
  ] =
    useState<Board | null>(
      null,
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
    );
  const [
    nonce,
    setNonce,
  ] =
    useState(
      0,
    );
  const [
    social,
    setSocial,
  ] =
    useState<MusicSocial | null>(
      null,
    );
  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );
  /** The last switch save failed (the switch shows the server's value again). */
  const [
    switchFailed,
    setSwitchFailed,
  ] =
    useState(
      false,
    );
  const [
    reporting,
    setReporting,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const helpId =
    useId();
  const loading =
    board ===
      null &&
    !failed;
  const arrival =
    useArrival(
      !loading,
    );
  const asked =
    useRef(
      0,
    );

  useEffect(() => {
    const ask =
      ++asked.current;
    setBoard(
      null,
    );
    setFailed(
      false,
    );
    api(
      dailyBoardApi,
      {
        query:
          {
            date,
            scope,
          },
      },
    )
      .then(
        (
          b,
        ) => {
          if (
            ask ===
            asked.current
          )
            setBoard(
              b,
            );
        },
      )
      .catch(
        () => {
          if (
            ask ===
            asked.current
          )
            setFailed(
              true,
            );
        },
      );
  }, [
    date,
    scope,
    nonce,
  ]);

  useEffect(() => {
    api(
      musicSocialApi,
      {},
    )
      .then(
        setSocial,
      )
      .catch(
        () =>
          setSocial(
            null,
          ),
      );
  }, []);

  function setSwitch(body: {
    board?: boolean;
    friends?: boolean;
  }) {
    setSaving(
      true,
    );
    setSwitchFailed(
      false,
    );
    api(
      setMusicSocialApi,
      {
        body,
      },
    )
      .then(
        (
          s,
        ) => {
          setSocial(
            s,
          );
          setNonce(
            (
              n,
            ) =>
              n +
              1,
          );
        },
      )
      .catch(
        () => {
          setSwitchFailed(
            true,
          );
          setNonce(
            (
              n,
            ) =>
              n +
              1,
          );
        },
      )
      .finally(
        () =>
          setSaving(
            false,
          ),
      );
  }

  const title =
    day ===
    'today'
      ? t(
          'board-title-today',
          {
            defaultValue:
              "Today's board",
          },
        )
      : t(
          'board-title-yesterday',
          {
            defaultValue:
              "Yesterday's board",
          },
        );

  return (
    <Shell
      title={
        title
      }
      busy={
        loading
      }
      back={{
        to: '/rmhmusic/sprint',
        label:
          t(
            'board-back',
            {
              defaultValue:
                'Back to sight reading',
            },
          ),
      }}
    >
      <p className="text-base leading-6 text-app-text-muted">
        {t(
          'board-about',
          {
            defaultValue:
              "Everyone's first Daily challenge run of the day, best score first. Faster reading breaks a tie.",
          },
        )}
      </p>
      <nav
        aria-label={t(
          'board-days',
          {
            defaultValue:
              'Which day',
          },
        )}
        className="flex flex-wrap gap-x-5"
      >
        <Link
          to="/rmhmusic/daily"
          search={{}}
          aria-current={
            day ===
            'today'
              ? 'page'
              : undefined
          }
          className={
            day ===
            'today'
              ? `${TEXT_BUTTON} text-app-text no-underline`
              : TEXT_BUTTON
          }
        >
          {t(
            'board-today',
            {
              defaultValue:
                'Today',
            },
          )}
        </Link>
        <Link
          to="/rmhmusic/daily"
          search={{
            day: 'yesterday',
          }}
          aria-current={
            day ===
            'yesterday'
              ? 'page'
              : undefined
          }
          className={
            day ===
            'yesterday'
              ? `${TEXT_BUTTON} text-app-text no-underline`
              : TEXT_BUTTON
          }
        >
          {t(
            'board-yesterday',
            {
              defaultValue:
                'Yesterday',
            },
          )}
        </Link>
      </nav>

      <section className="rmm-sheet divide-y divide-app-border">
        <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p
              role="status"
              className="min-h-6 text-base leading-6 text-app-text"
            >
              {board
                ? boardStatusSentence(
                    t,
                    board.me,
                    {
                      day,
                      // With the friends switch off the line is the Everyone board's.
                      scope:
                        board.friendsOff
                          ? 'everyone'
                          : scope,
                    },
                  )
                : ''}
            </p>
            <p className="min-h-5 text-sm leading-5 text-app-text-muted">
              {day ===
              'today'
                ? nextBoardLine(
                    t,
                    i18n.language,
                    now,
                  )
                : board?.final
                  ? t(
                      'board-final',
                      {
                        defaultValue:
                          'This board is final.',
                      },
                    )
                  : ''}
            </p>
          </div>
        </div>
        <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <label
              htmlFor={`${helpId}-switch`}
              className="text-sm leading-5 font-medium text-app-text"
            >
              {t(
                'social-board-label',
                {
                  defaultValue:
                    'Show my Daily challenge scores on the board',
                },
              )}
            </label>
            <p
              id={
                helpId
              }
              className="text-sm leading-5 text-app-text-muted"
            >
              {t(
                'social-board-help',
                {
                  defaultValue:
                    'Signed-in learners see your name, picture and score. Off hides every day at once.',
                },
              )}
            </p>
            {switchFailed ? (
              <p
                role="status"
                className="text-sm leading-5 text-app-danger"
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
          </div>
          <Switch
            id={`${helpId}-switch`}
            checked={
              social?.board ??
              false
            }
            disabled={
              social ===
                null ||
              saving
            }
            aria-describedby={
              helpId
            }
            onCheckedChange={(
              on,
            ) =>
              setSwitch(
                {
                  board:
                    on,
                },
              )
            }
          />
        </div>
      </section>

      <Tabs
        tabs={[
          {
            id: 'everyone',
            label:
              t(
                'board-everyone',
                {
                  defaultValue:
                    'Everyone',
                },
              ),
          },
          {
            id: 'friends',
            label:
              t(
                'board-friends',
                {
                  defaultValue:
                    'Friends',
                },
              ),
          },
        ]}
        value={
          scope
        }
        onChange={(
          id,
        ) =>
          setScope(
            id ===
              'friends'
              ? 'friends'
              : 'everyone',
          )
        }
        aria-label={t(
          'board-scope',
          {
            defaultValue:
              'Whose scores',
          },
        )}
      />

      {loading ? (
        <div>
          <p
            role="status"
            className="sr-only"
          >
            {t(
              'board-loading',
              {
                defaultValue:
                  'Loading the board…',
              },
            )}
          </p>
          <ol
            aria-hidden="true"
            className="rmm-sheet divide-y divide-app-border"
          >
            {Array.from(
              {
                length: 10,
              },
              (
                _,
                i,
              ) => (
                <li
                  key={
                    i
                  }
                  className={`${ROW} px-4`}
                >
                  <span className="h-4 w-6 rounded-app-sm bg-app-surface-hover" />
                  <span className="h-8 w-8 rounded-full bg-app-surface-hover" />
                  <span className="h-4 w-32 rounded-app-sm bg-app-surface-hover" />
                </li>
              ),
            )}
          </ol>
        </div>
      ) : failed ? (
        <div
          className={`rmm-sheet space-y-2 p-4 ${arrival ?? ''}`}
        >
          <p className="text-app-text">
            {t(
              'board-failed',
              {
                defaultValue:
                  "Couldn't load the board.",
              },
            )}
          </p>
          <button
            type="button"
            onClick={() =>
              setNonce(
                (
                  n,
                ) =>
                  n +
                  1,
              )
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
      ) : board ? (
        <div
          className={`space-y-4 ${arrival ?? ''}`}
        >
          {board.friendsOff ? (
            <div className="rmm-sheet space-y-2 p-4">
              <p className="text-base leading-6 text-app-text">
                {t(
                  'board-friends-off',
                  {
                    defaultValue:
                      'Friends are people you follow who follow you back. You see them here while you share your own progress with friends.',
                  },
                )}
              </p>
              <button
                type="button"
                disabled={
                  saving
                }
                onClick={() =>
                  setSwitch(
                    {
                      friends: true,
                    },
                  )
                }
                className={
                  TEXT_BUTTON
                }
              >
                {t(
                  'board-friends-turn-on',
                  {
                    defaultValue:
                      'Share my progress with friends',
                  },
                )}
              </button>
            </div>
          ) : board
              .rows
              .length ===
            0 ? (
            <p className="rmm-sheet p-4 text-base leading-6 text-app-text-muted">
              {scope ===
              'friends'
                ? t(
                    'board-empty-friends',
                    {
                      defaultValue:
                        'None of your friends is on this board yet.',
                    },
                  )
                : t(
                    'board-empty',
                    {
                      defaultValue:
                        'No one is on this board yet.',
                    },
                  )}
            </p>
          ) : (
            <BoardList
              rows={
                board.rows
              }
              onReport={
                setReporting
              }
            />
          )}
          {board.around ? (
            <section className="space-y-2">
              <h2 className="text-sm leading-5 font-semibold text-app-text-muted">
                {t(
                  'board-around',
                  {
                    defaultValue:
                      'Around you',
                  },
                )}
              </h2>
              <BoardList
                rows={
                  board.around
                }
                onReport={
                  setReporting
                }
              />
            </section>
          ) : null}
          <button
            type="button"
            onClick={() =>
              setNonce(
                (
                  n,
                ) =>
                  n +
                  1,
              )
            }
            className={
              TEXT_BUTTON
            }
          >
            {t(
              'board-refresh',
              {
                defaultValue:
                  'Refresh',
              },
            )}
          </button>
        </div>
      ) : null}

      {reporting ? (
        <Suspense
          fallback={
            null
          }
        >
          <ReportDialog
            open
            onOpenChange={(
              open,
            ) => {
              if (
                !open
              )
                setReporting(
                  null,
                );
            }}
            entityType="music-score"
            entityId={
              reporting
            }
          />
        </Suspense>
      ) : null}
    </Shell>
  );
}

/** The rows, as an ordered list that reads one sentence per row. */
function BoardList({
  rows,
  onReport,
}: {
  rows: readonly DailyBoardRow[];
  onReport: (
    rowId: string,
  ) => void;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  return (
    <ol className="rmm-sheet divide-y divide-app-border">
      {rows.map(
        (
          row,
        ) => {
          const name =
            learnerName(
              t,
              row
                .user
                .name,
            );
          return (
            <li
              key={
                row.rowId
              }
              aria-current={
                row.you
                  ? 'true'
                  : undefined
              }
              className={`${ROW} ps-4 pe-1 ${row.you ? 'bg-app-surface-hover' : ''}`}
            >
              <span className="sr-only">
                {boardRowSentence(
                  t,
                  i18n.language,
                  row,
                )}
              </span>
              <span
                aria-hidden="true"
                dir="ltr"
                className="w-8 shrink-0 font-mono text-sm tabular-nums text-app-text-muted"
              >
                {
                  row.rank
                }
              </span>
              <UserAvatar
                src={
                  row
                    .user
                    .image
                }
                alt=""
                size={
                  32
                }
                fallbackName={
                  name
                }
              />
              <span
                aria-hidden="true"
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-base leading-6 text-app-text">
                  {
                    name
                  }
                </span>
                {row.withoutChords ? (
                  <span className="block truncate text-xs leading-4 text-app-text-muted">
                    {t(
                      'board-without-chords',
                      {
                        defaultValue:
                          'without chords',
                      },
                    )}
                  </span>
                ) : null}
              </span>
              <span
                aria-hidden="true"
                dir="ltr"
                className="shrink-0 text-end font-mono tabular-nums"
              >
                <span className="block text-base leading-6 text-app-text">
                  {
                    row.score
                  }
                </span>
                <span className="block text-xs leading-4 text-app-text-muted">
                  {row.avgMs ===
                  null
                    ? ''
                    : t(
                        'board-seconds',
                        {
                          seconds:
                            secondsANote(
                              i18n.language,
                              row.avgMs,
                            ),
                          defaultValue:
                            '{{seconds}} s',
                        },
                      )}
                </span>
              </span>
              {row.you ? (
                <span className="h-11 w-11 shrink-0" />
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onReport(
                      row.rowId,
                    )
                  }
                  aria-label={t(
                    'board-report',
                    {
                      name,
                      defaultValue:
                        'Report the score of {{name}}',
                    },
                  )}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-app-sm text-app-text-muted transition-colors hover:bg-app-surface-hover hover:text-app-text"
                >
                  <Flag
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                </button>
              )}
            </li>
          );
        },
      )}
    </ol>
  );
}

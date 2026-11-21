/**
 * The daily puzzle statistics page body (`/daily/stats`).
 *
 * Signed in, the figures come from the server (`GET /api/daily-puzzles/stats`), so they
 * follow the member across devices. As a guest they are computed from the local store by
 * the same pure function, with a prompt saying that signing in keeps the history.
 */
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSession } from '@/components/Providers';
import {
  PuzzleBackLink,
  PuzzlePage,
} from '@/components/daily-puzzles/PuzzleShell';
import { useModeTitle } from '@/components/daily-puzzles/mode-title';
import { StatsCalendar } from '@/components/daily-puzzles/StatsCalendar';
import { BarChart } from '@/components/ui/bar-chart';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { DESK_MODES } from '@/lib/daily-puzzles/desk-modes';
import { readLocalRows } from '@/lib/daily-puzzles/local-rows';
import {
  formatDateKey,
  getTodayEST,
} from '@/lib/daily-puzzles/seed';
import {
  computeDailyStats,
  type DailyStats as Stats,
  type ModeStats,
  type StatBucket,
  type StatMetric,
} from '@/lib/daily-puzzles/stats';
import { getDailyStatsApi } from '@/lib/daily-puzzles/stats.contract';

/** Seconds as `m:ss`. */
function clock(
  seconds: number,
): string {
  const s =
    Math.round(
      seconds,
    );
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function DailyStats() {
  const {
    t,
  } =
    useTranslation(
      'daily-stats',
    );
  const {
    data: session,
    isPending:
      sessionPending,
  } =
    useSession();
  const signedIn =
    !!session?.user;
  const todayKey =
    useMemo(
      () =>
        formatDateKey(
          getTodayEST(),
        ),
      [],
    );
  const modeTitle =
    useModeTitle();

  const query =
    useQuery(
      {
        ...apiQuery(
          getDailyStatsApi,
          {},
        ),
        enabled:
          signedIn,
        retry: false,
      },
    );

  // The local store only exists in the browser, so it is read after mount.
  const [
    local,
    setLocal,
  ] =
    useState<Stats | null>(
      null,
    );
  useEffect(() => {
    if (
      !sessionPending &&
      !signedIn
    )
      setLocal(
        computeDailyStats(
          readLocalRows(),
          todayKey,
        ),
      );
  }, [
    sessionPending,
    signedIn,
    todayKey,
  ]);

  const stats =
    signedIn
      ? query.data
      : local;
  const arrival =
    useArrival(
      !!stats,
    );

  const modeTitles =
    Object.fromEntries(
      DESK_MODES.map(
        (
          m,
        ) => [
          m.id,
          modeTitle(
            m.id,
          ),
        ],
      ),
    );

  const heading =
    (
      <>
        <PuzzleBackLink />
        <h1 className="t-title mb-6 text-site-text">
          {t(
            'title',
            {
              defaultValue:
                'Daily puzzle statistics',
            },
          )}
        </h1>
      </>
    );

  if (
    sessionPending ||
    (signedIn &&
      query.isPending) ||
    (!signedIn &&
      !local)
  ) {
    return (
      <PuzzlePage width="md">
        {
          heading
        }
        <div
          className="space-y-4"
          aria-busy
        >
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PuzzlePage>
    );
  }

  if (
    signedIn &&
    (query.isError ||
      !stats)
  ) {
    return (
      <PuzzlePage width="md">
        {
          heading
        }
        <EmptyState
          title={t(
            'error-title',
            {
              defaultValue:
                'Could not load your statistics',
            },
          )}
          action={
            <Button
              variant="default"
              onClick={() =>
                void query.refetch()
              }
            >
              {t(
                'retry',
                {
                  defaultValue:
                    'Try again',
                },
              )}
            </Button>
          }
        />
      </PuzzlePage>
    );
  }
  if (
    !stats
  )
    return null;

  const empty =
    stats.totalSolves ===
    0;

  return (
    <PuzzlePage width="md">
      {
        heading
      }
      <div
        className={`flex flex-col gap-8 ${arrival ?? ''}`}
      >
        {!signedIn ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-site-border pb-4">
            <p className="t-body max-w-prose text-site-text-muted">
              {t(
                'guest-note',
                {
                  defaultValue:
                    'These figures come from this browser. Sign in to keep your history and streak across devices.',
                },
              )}
            </p>
            <Button
              asChild
              variant="default"
            >
              <Link
                to="/login"
                search={{
                  callbackURL:
                    '/daily/stats',
                }}
              >
                {t(
                  'sign-in',
                  {
                    defaultValue:
                      'Sign in',
                  },
                )}
              </Link>
            </Button>
          </div>
        ) : null}

        {empty ? (
          <EmptyState
            title={t(
              'empty-title',
              {
                defaultValue:
                  'No puzzles solved yet',
              },
            )}
            description={t(
              'empty-description',
              {
                defaultValue:
                  'Solve a daily puzzle and your streak and scores appear here.',
              },
            )}
            action={
              <Button
                asChild
                variant="default"
              >
                <Link to="/daily">
                  {t(
                    'empty-action',
                    {
                      defaultValue:
                        'Play today',
                    },
                  )}
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <Overall
              stats={
                stats
              }
            />
            <StatsCalendar
              days={
                stats.days
              }
              firstDay={
                stats.firstDay
              }
              todayKey={
                todayKey
              }
              modeTitles={
                modeTitles
              }
            />
            {stats.modes.map(
              (
                m,
              ) => (
                <ModeSection
                  key={
                    m.mode
                  }
                  stats={
                    m
                  }
                  title={
                    modeTitles[
                      m
                        .mode
                    ] ??
                    m.mode
                  }
                />
              ),
            )}
          </>
        )}
      </div>
    </PuzzlePage>
  );
}

function Figures({
  items,
}: {
  items: {
    key: string;
    label: string;
    value: string;
  }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {items.map(
        (
          i,
        ) => (
          <div
            key={
              i.key
            }
            className="flex flex-col gap-1"
          >
            <dt className="t-label">
              {
                i.label
              }
            </dt>
            <dd className="t-title tabular-nums text-site-text">
              {
                i.value
              }
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}

function Overall({
  stats,
}: {
  stats: Stats;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'daily-stats',
    );
  const number =
    useMemo(
      () =>
        new Intl.NumberFormat(
          i18n.language,
        ),
      [
        i18n.language,
      ],
    );
  return (
    <section
      aria-labelledby="daily-stats-overall"
      className="flex flex-col gap-4"
    >
      <h2
        id="daily-stats-overall"
        className="t-heading text-site-text"
      >
        {t(
          'overall-heading',
          {
            defaultValue:
              'Overall',
          },
        )}
      </h2>
      <Figures
        items={[
          {
            key: 'streak',
            label:
              t(
                'figure-streak',
                {
                  defaultValue:
                    'Current streak',
                },
              ),
            value:
              number.format(
                stats.currentStreak,
              ),
          },
          {
            key: 'longest',
            label:
              t(
                'figure-longest',
                {
                  defaultValue:
                    'Longest streak',
                },
              ),
            value:
              number.format(
                stats.longestStreak,
              ),
          },
          {
            key: 'days',
            label:
              t(
                'figure-days-played',
                {
                  defaultValue:
                    'Days played',
                },
              ),
            value:
              number.format(
                stats.daysPlayed,
              ),
          },
        ]}
      />
    </section>
  );
}

function bucketLabel(
  t: TFunction,
  metric: StatMetric,
  b: StatBucket,
  number: Intl.NumberFormat,
): string {
  const show =
    (
      n: number,
    ) =>
      metric ===
      'time'
        ? clock(
            n,
          )
        : number.format(
            n,
          );
  return b.max ===
    null
    ? t(
        'bucket-open',
        {
          defaultValue:
            '{{min}}+',
          min: show(
            b.min,
          ),
        },
      )
    : t(
        'bucket-range',
        {
          defaultValue:
            '{{min}}–{{max}}',
          min: show(
            b.min,
          ),
          max: show(
            b.max,
          ),
        },
      );
}

function ModeSection({
  stats,
  title,
}: {
  stats: ModeStats;
  title: string;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'daily-stats',
    );
  const number =
    useMemo(
      () =>
        new Intl.NumberFormat(
          i18n.language,
        ),
      [
        i18n.language,
      ],
    );
  const decimal =
    useMemo(
      () =>
        new Intl.NumberFormat(
          i18n.language,
          {
            maximumFractionDigits: 1,
          },
        ),
      [
        i18n.language,
      ],
    );
  const percent =
    useMemo(
      () =>
        new Intl.NumberFormat(
          i18n.language,
          {
            style:
              'percent',
            maximumFractionDigits: 0,
          },
        ),
      [
        i18n.language,
      ],
    );
  const show =
    (
      n:
        | number
        | null,
    ) =>
      n ===
      null
        ? '–'
        : stats.metric ===
            'time'
          ? clock(
              n,
            )
          : decimal.format(
              n,
            );

  const bestLabel =
    stats.metric ===
    'moves'
      ? t(
          'figure-best-moves',
          {
            defaultValue:
              'Fewest moves',
          },
        )
      : stats.metric ===
          'time'
        ? t(
            'figure-best-time',
            {
              defaultValue:
                'Fastest time',
            },
          )
        : t(
            'figure-best-score',
            {
              defaultValue:
                'Best score',
            },
          );
  const averageLabel =
    stats.metric ===
    'moves'
      ? t(
          'figure-average-moves',
          {
            defaultValue:
              'Average moves',
          },
        )
      : stats.metric ===
          'time'
        ? t(
            'figure-average-time',
            {
              defaultValue:
                'Average time',
            },
          )
        : t(
            'figure-average-score',
            {
              defaultValue:
                'Average score',
            },
          );

  const bars =
    stats.distribution.map(
      (
        b,
      ) => ({
        label:
          bucketLabel(
            t,
            stats.metric,
            b,
            number,
          ),
        value:
          b.count,
      }),
    );
  const headingId = `daily-stats-${stats.mode}`;

  return (
    <section
      aria-labelledby={
        headingId
      }
      className="flex flex-col gap-4 border-t border-site-border pt-6"
    >
      <h2
        id={
          headingId
        }
        className="t-heading text-site-text"
      >
        {
          title
        }
      </h2>
      {stats.played ===
      0 ? (
        <p className="t-body text-site-text-muted">
          {t(
            'mode-empty',
            {
              defaultValue:
                'Not played yet.',
            },
          )}
        </p>
      ) : (
        <>
          <Figures
            items={[
              {
                key: 'played',
                label:
                  t(
                    'figure-played',
                    {
                      defaultValue:
                        'Played',
                    },
                  ),
                value:
                  number.format(
                    stats.played,
                  ),
              },
              {
                key: 'solved',
                label:
                  t(
                    'figure-solved',
                    {
                      defaultValue:
                        'Solved',
                    },
                  ),
                value:
                  number.format(
                    stats.solved,
                  ),
              },
              {
                key: 'rate',
                label:
                  t(
                    'figure-solve-rate',
                    {
                      defaultValue:
                        'Solve rate',
                    },
                  ),
                value:
                  percent.format(
                    stats.solveRate,
                  ),
              },
              {
                key: 'streak',
                label:
                  t(
                    'figure-streak',
                    {
                      defaultValue:
                        'Current streak',
                    },
                  ),
                value:
                  number.format(
                    stats.currentStreak,
                  ),
              },
              {
                key: 'longest',
                label:
                  t(
                    'figure-longest',
                    {
                      defaultValue:
                        'Longest streak',
                    },
                  ),
                value:
                  number.format(
                    stats.longestStreak,
                  ),
              },
              {
                key: 'best',
                label:
                  bestLabel,
                value:
                  show(
                    stats.best,
                  ),
              },
              {
                key: 'average',
                label:
                  averageLabel,
                value:
                  show(
                    stats.average,
                  ),
              },
            ]}
          />
          {stats.solved >
          0 ? (
            <BarChart
              bars={
                bars
              }
              label={t(
                'distribution-label',
                {
                  defaultValue:
                    'Results for {{mode}}',
                  mode: title,
                },
              )}
              summary={t(
                'distribution-summary',
                {
                  defaultValue:
                    'How your {{mode}} results are spread across ranges.',
                  mode: title,
                },
              )}
              columns={{
                label:
                  t(
                    'distribution-column-range',
                    {
                      defaultValue:
                        'Range',
                    },
                  ),
                value:
                  t(
                    'distribution-column-count',
                    {
                      defaultValue:
                        'Runs',
                    },
                  ),
              }}
            />
          ) : null}
          {stats.solved >
          0 ? (
            // Sighted readers get the counts as text too; the chart's own table serves screen readers.
            <ul
              aria-hidden
              className="t-meta m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0"
            >
              {bars
                .filter(
                  (
                    b,
                  ) =>
                    b.value >
                    0,
                )
                .map(
                  (
                    b,
                  ) => (
                    <li
                      key={
                        b.label
                      }
                    >
                      {
                        b.label
                      }
                      :{' '}
                      {number.format(
                        b.value,
                      )}
                    </li>
                  ),
                )}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

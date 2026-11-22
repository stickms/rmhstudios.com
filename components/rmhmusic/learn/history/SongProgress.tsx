/**
 * SongProgress — `/rmhmusic/history?song=<id>`: every attempt the learner has made at one song,
 * the lower scores included, with a line of scores over time (the shared LineChart, which also
 * offers the same numbers as a table) and the attempts as a list, newest first. Filter by how it
 * was played with the shared Tabs. Reached from a song row in the history list and from the song
 * page. An id that is not in the songbook says so and links back.
 */
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LineChart } from '@/components/ui/line-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { getSongProgressApi } from '@/lib/rmhmusic/history.contract';
import { songById } from '@/lib/rmhmusic/learn/songs/catalog';
import { SECONDARY_BUTTON, TEXT_BUTTON } from '../buttons';
import { Shell } from '../LessonScreen';
import { formatDuration, songModeName } from './history-text';

type ModeFilter = 'all' | 'wait' | 'play';

const TABS_ID = 'rmm-song-progress';

/** The chart's ink, set once on the container. */
const CHART_INK = {
  '--chart-ink': 'var(--app-accent)',
  '--chart-rule': 'var(--app-border)',
} as React.CSSProperties;

export function SongProgress({ songId }: { songId: string }) {
  const { t, i18n } = useTranslation('music-history');
  const locale = i18n.language;
  const song = songById(songId);
  const [mode, setMode] = useState<ModeFilter>('all');
  const query = useQuery({
    queryKey: ['rmhmusic', 'history', 'song', songId, mode],
    queryFn: ({ signal }) =>
      api(getSongProgressApi, {
        params: {
          songId,
        },
        query:
          mode === 'all'
            ? {}
            : {
                mode,
              },
        signal,
      }),
    enabled: !!song,
    retry: false,
  });
  const attempts = useMemo(() => (query.data?.attempts ?? []).filter((a) => a.score !== null), [query.data]);
  const arrival = useArrival(!query.isPending);
  const dateTime = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const dateOnly = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
      }),
    [locale],
  );
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const back = {
    to: '/rmhmusic/history' as const,
    label: t('song-back', {
      defaultValue: 'Practice history',
    }),
  };

  if (!song) {
    return (
      <Shell
        title={t('song-unknown', {
          defaultValue: 'Song not found',
        })}
        back={back}
      >
        <p className="text-app-text-muted">
          {t('song-unknown-body', {
            defaultValue: 'That song is not in the songbook.',
          })}
        </p>
      </Shell>
    );
  }

  const signedOut = query.error instanceof HttpError && query.error.status === 401;
  const scores = attempts.map((a) => a.score ?? 0);
  const best = scores.length > 0 ? Math.max(...scores) : 0;
  const chartLabel = t('song-chart-label', {
    defaultValue: 'Score of each attempt at {{title}}',
    title: song.title,
  });

  return (
    <Shell title={song.title} busy={query.isPending} back={back}>
      <div className="space-y-6" style={CHART_INK}>
        <h2 className="text-lg font-semibold text-app-text">
          {t('song-progress-heading', {
            defaultValue: 'Progress',
          })}
        </h2>
        <Tabs
          idBase={TABS_ID}
          tabs={[
            {
              id: 'all',
              label: t('song-filter-all', {
                defaultValue: 'All attempts',
              }),
            },
            {
              id: 'wait',
              label: songModeName(t, 'wait'),
            },
            {
              id: 'play',
              label: songModeName(t, 'play'),
            },
          ]}
          value={mode}
          onChange={(id) => setMode(id as ModeFilter)}
          aria-label={t('song-filter-label', {
            defaultValue: 'How it was played',
          })}
        />
        <div
          role="tabpanel"
          id={`${TABS_ID}-panel-${mode}`}
          aria-labelledby={`${TABS_ID}-tab-${mode}`}
          className="space-y-6"
        >
          {query.isError ? (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-app-text-muted">
                {signedOut
                  ? t('signed-out', {
                      defaultValue: 'Your session ended. Sign in again to see your history.',
                    })
                  : t('song-error', {
                      defaultValue: 'Could not load your attempts.',
                    })}
              </p>
              {signedOut ? (
                <Link
                  to="/login"
                  search={{
                    callbackURL: `/rmhmusic/history?song=${songId}`,
                  }}
                  className={TEXT_BUTTON}
                >
                  {t('sign-in', {
                    defaultValue: 'Sign in',
                  })}
                </Link>
              ) : (
                <button type="button" onClick={() => void query.refetch()} className={SECONDARY_BUTTON}>
                  {t('retry', {
                    defaultValue: 'Try again',
                  })}
                </button>
              )}
            </div>
          ) : query.isPending ? (
            <div aria-busy className="space-y-2">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : attempts.length === 0 ? (
            <p className="text-sm text-app-text-muted">
              {t('song-empty', {
                defaultValue: 'No attempts yet. Play {{title}} and each run is kept here.',
                title: song.title,
              })}
            </p>
          ) : (
            <div className={`space-y-6 ${arrival ?? ''}`}>
              <p className="text-sm text-app-text-muted">
                {t('song-summary', {
                  defaultValue: '{{count}} attempts, best score {{best}}.',
                  defaultValue_one: '{{count}} attempt, best score {{best}}.',
                  count: attempts.length,
                  best: number.format(best),
                })}
              </p>
              <LineChart
                label={chartLabel}
                series={[
                  {
                    id: 'score',
                    label: t('song-series', {
                      defaultValue: 'Score',
                    }),
                    points: attempts.map((a) => ({
                      x: a.createdAt,
                      y: a.score ?? 0,
                    })),
                  },
                ]}
                labels={{
                  showChart: t('chart-show', {
                    defaultValue: 'Show chart',
                  }),
                  showTable: t('chart-table', {
                    defaultValue: 'Show as table',
                  }),
                  day: t('chart-x', {
                    defaultValue: 'Attempt',
                  }),
                  points: t('chart-points', {
                    defaultValue: 'Attempts',
                  }),
                  seriesSummary: (v) =>
                    t('chart-series-summary', {
                      defaultValue: '{{label}}: from {{first}} to {{last}}, lowest {{min}}, highest {{max}}.',
                      ...v,
                    }),
                }}
                formatX={(x) => dateOnly.format(new Date(x))}
              />
              <ul>
                {[...attempts].reverse().map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-app-border py-3"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-app-text">
                        {t('row-score', {
                          defaultValue: 'Score {{score}}',
                          score: number.format(a.score ?? 0),
                        })}
                      </span>
                      <p className="text-sm text-app-text-muted">{dateTime.format(new Date(a.createdAt))}</p>
                    </div>
                    <p className="text-sm text-app-text-muted">
                      {[songModeName(t, a.mode), a.durationMs !== null ? formatDuration(a.durationMs, locale) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Link
          to="/rmhmusic/songs/$songId"
          params={{
            songId,
          }}
          className={TEXT_BUTTON}
        >
          {t('song-open', {
            defaultValue: 'Play this song',
          })}
        </Link>
      </div>
    </Shell>
  );
}

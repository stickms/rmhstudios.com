/**
 * WatchStatsPanel: the member's own RMHTube watching on the landing. The six counters, the last 30 UTC days of
 * minutes as a bar chart (with its table alternative), and Pause / Resume and Clear. Owner only: it reads
 * /api/rmhtube/stats, which answers for the session's user and nobody else. App tier (L8): `--app-*` tokens.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart } from '@/components/ui/bar-chart';
import { useArrival } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiQuery } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { toast } from '@/lib/shared/app-toast';
import { isEmptyStats } from '@/lib/rmhtube/stats';
import { clearWatchStatsApi, getWatchStatsApi, setWatchStatsPausedApi } from '@/lib/rmhtube/stats.contract';

const BUTTON =
  'inline-flex min-h-9 items-center justify-center rounded-app-sm border border-app-border px-4 text-sm font-medium text-app-text transition-colors hover:bg-app-surface-hover disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11';

export default function WatchStatsPanel() {
  const { t, i18n } = useTranslation('rmhtube-stats');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const query = useQuery(apiQuery(getWatchStatsApi));
  const arrive = useArrival(query.isSuccess);
  const number = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);
  const dayLabel = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return (day: string) => f.format(new Date(`${day}T00:00:00Z`));
  }, [i18n.language]);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [getWatchStatsApi.path],
    });

  const pauseMutation = useMutation({
    mutationFn: (paused: boolean) =>
      api(setWatchStatsPausedApi, {
        body: {
          paused,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        res.paused
          ? t('toast-paused', {
              defaultValue: 'Recording paused.',
            })
          : t('toast-resumed', {
              defaultValue: 'Recording resumed.',
            }),
      );
      void refresh();
    },
    onError: () =>
      toast.error(
        t('toast-error', {
          defaultValue: 'Could not update your statistics. Try again.',
        }),
      ),
  });

  const clearMutation = useMutation({
    mutationFn: () => api(clearWatchStatsApi),
    onSuccess: () => {
      toast.success(
        t('toast-cleared', {
          defaultValue: 'Statistics cleared.',
        }),
      );
      void refresh();
    },
    onError: () =>
      toast.error(
        t('toast-error', {
          defaultValue: 'Could not update your statistics. Try again.',
        }),
      ),
  });

  const handleClear = async () => {
    const ok = await confirm({
      title: t('clear-title', {
        defaultValue: 'Clear your statistics?',
      }),
      description: t('clear-description', {
        defaultValue: 'This sets every figure to zero and deletes the daily minutes. It cannot be undone.',
      }),
      confirmLabel: t('clear-confirm', {
        defaultValue: 'Clear statistics',
      }),
      cancelLabel: t('clear-cancel', {
        defaultValue: 'Cancel',
      }),
      danger: true,
    });
    if (ok) clearMutation.mutate();
  };

  // The landing is for signed-in members; a signed-out viewer gets no panel rather than an error.
  if (query.error instanceof HttpError && query.error.status === 401) return null;

  const heading = (
    <div>
      <h2 className="text-xl font-semibold">
        {t('title', {
          defaultValue: 'Your watching',
        })}
      </h2>
      <p className="mt-1 text-sm text-app-text-muted">
        {t('subtitle', {
          defaultValue: 'Only you can see these figures.',
        })}
      </p>
    </div>
  );

  if (query.isPending) {
    return (
      <section
        aria-busy="true"
        aria-label={t('title', {
          defaultValue: 'Your watching',
        })}
        className="rounded-app app-glass p-6"
      >
        {heading}
        <Skeleton className="mt-4 h-24" />
        <Skeleton className="mt-4 h-28" />
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="rounded-app app-glass p-6">
        {heading}
        <p role="alert" className="mt-4 text-sm text-app-text-muted">
          {t('error', {
            defaultValue: 'Could not load your statistics.',
          })}
        </p>
        <button type="button" className={`${BUTTON} mt-3`} onClick={() => void query.refetch()}>
          {t('retry', {
            defaultValue: 'Try again',
          })}
        </button>
      </section>
    );
  }

  const stats = query.data;
  const c = stats.counters;
  const hours = Math.floor(c.totalWatchTimeMinutes / 60);
  const minutes = c.totalWatchTimeMinutes % 60;
  const rows: {
    key: string;
    label: string;
    value: string;
  }[] = [
    {
      key: 'time',
      label: t('counter-time', {
        defaultValue: 'Time watched',
      }),
      value: t('time-value', {
        defaultValue: '{{hours}}h {{minutes}}m',
        hours: number.format(hours),
        minutes: number.format(minutes),
      }),
    },
    {
      key: 'videos',
      label: t('counter-videos', {
        defaultValue: 'Videos watched',
      }),
      value: number.format(c.videosWatched),
    },
    {
      key: 'created',
      label: t('counter-created', {
        defaultValue: 'Rooms hosted',
      }),
      value: number.format(c.roomsCreated),
    },
    {
      key: 'joined',
      label: t('counter-joined', {
        defaultValue: 'Rooms joined',
      }),
      value: number.format(c.roomsJoined),
    },
    {
      key: 'messages',
      label: t('counter-messages', {
        defaultValue: 'Messages sent',
      }),
      value: number.format(c.messagesSent),
    },
    {
      key: 'reactions',
      label: t('counter-reactions', {
        defaultValue: 'Reactions used',
      }),
      value: number.format(c.reactionsUsed),
    },
  ];
  const windowMinutes = stats.days.reduce((sum, d) => sum + d.minutes, 0);
  const chartLabel = t('chart-label', {
    defaultValue: 'Minutes watched per day',
  });

  return (
    <section
      aria-label={t('title', {
        defaultValue: 'Your watching',
      })}
      className={`rounded-app app-glass p-6 ${arrive ?? ''}`}
    >
      {heading}

      {stats.paused ? (
        <p className="mt-4 border-b border-app-border pb-3 text-sm text-app-text">
          {t('paused', {
            defaultValue: 'Paused. Nothing new is recorded.',
          })}
        </p>
      ) : null}

      {isEmptyStats(stats) ? (
        <p className="mt-4 text-sm text-app-text-muted">
          {t('empty', {
            defaultValue: 'Nothing recorded yet',
          })}
        </p>
      ) : (
        <>
          <dl className="mt-4">
            {rows.map((row) => (
              <div key={row.key} className="flex items-baseline justify-between gap-4 border-b border-app-border py-2">
                <dt className="text-sm text-app-text-muted">{row.label}</dt>
                <dd className="font-mono text-sm text-app-text">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div
            className="mt-4"
            style={
              {
                '--chart-ink': 'var(--app-accent)',
              } as CSSProperties
            }
          >
            <h3 className="mb-1 text-sm font-medium text-app-text-muted">
              {t('chart-heading', {
                defaultValue: 'Last 30 days',
              })}
            </h3>
            <BarChart
              bars={stats.days.map((d) => ({
                label: dayLabel(d.day),
                value: d.minutes,
              }))}
              label={chartLabel}
              summary={t('chart-summary', {
                count: Number(number.format(windowMinutes)),
                defaultValue_one: '{{minutes}} minute watched in the last 30 days, as bars.',
                defaultValue: '{{minutes}} minutes watched in the last 30 days, as bars.',
                minutes: number.format(windowMinutes),
              })}
              columns={{
                label: t('chart-column-day', {
                  defaultValue: 'Day',
                }),
                value: t('chart-column-minutes', {
                  defaultValue: 'Minutes',
                }),
              }}
            />
          </div>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={pauseMutation.isPending}
          onClick={() => pauseMutation.mutate(!stats.paused)}
        >
          {stats.paused
            ? t('resume', {
                defaultValue: 'Resume recording',
              })
            : t('pause', {
                defaultValue: 'Pause recording',
              })}
        </button>
        <button
          type="button"
          className={`${BUTTON} text-app-danger`}
          disabled={clearMutation.isPending || isEmptyStats(stats)}
          onClick={() => void handleClear()}
        >
          {t('clear', {
            defaultValue: 'Clear my statistics',
          })}
        </button>
      </div>
    </section>
  );
}

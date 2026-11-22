/**
 * RMHType progress: daily median speed and accuracy over a range with a 7-day rolling average, a summary, personal
 * bests and the recent runs. Reads the member's own stored races and standard solo runs only (custom and practice
 * tests are not stored as matches, and the page says so). The `/rmhtype` layout gates on sign-in.
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rmhTypeProgressQuery } from '@/lib/rmhtype/rmhtype.queries';
import {
  PROGRESS_MODES,
  PROGRESS_RANGES,
  RANGE_DAYS,
  rollingAverage,
  type ProgressMode,
  type ProgressRange,
} from '@/lib/rmhtype/progress';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import { Tabs } from '@/components/ui/tabs';
import { LineChart } from '@/components/ui/line-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { ProgressSummary } from '@/components/rmhtype/progress/ProgressSummary';
import { ProgressBests } from '@/components/rmhtype/progress/ProgressBests';
import { ProgressRuns } from '@/components/rmhtype/progress/ProgressRuns';
import { GhostClear } from '@/components/rmhtype/GhostControls';
import { useProgressLabels } from '@/components/rmhtype/progress/progress-labels';

export default function ProgressPage() {
  const { t } = useTranslation('rmhtype-progress');
  const f = useProgressLabels();
  const [range, setRange] = useState<ProgressRange>('90d');
  const [mode, setMode] = useState<ProgressMode>('all');
  const [runsFrom, setRunsFrom] = useState<string | null>(null);
  const runsRef = useRef<HTMLElement>(null);
  // The viewer's own zone buckets the days; it is read in the browser, where the query runs.
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const progress = useQuery(rmhTypeProgressQuery(range, mode, tz));
  const data = progress.data ?? null;
  const failed = progress.isError;
  const load = progress.refetch;
  const arrival = useArrival(data !== null);

  const charts = useMemo(() => {
    if (!data) return null;
    const build = (key: 'wpm' | 'accuracy', id: string, avgId: string, label: string, avgLabel: string) => {
      const values = data.daily.map((d) => d[key]);
      const avg = rollingAverage(values);
      return [
        {
          id,
          label,
          points: data.daily.map((d) => ({
            x: d.day,
            y: d[key],
          })),
        },
        {
          id: avgId,
          label: avgLabel,
          points: data.daily.map((d, i) => ({
            x: d.day,
            y: Math.round((avg[i] ?? 0) * 10) / 10,
          })),
        },
      ];
    };
    return {
      wpm: build(
        'wpm',
        'wpm',
        'wpm-avg',
        t('series-wpm', {
          defaultValue: 'Daily median speed',
        }),
        t('series-avg', {
          defaultValue: '7-day average',
        }),
      ),
      accuracy: build(
        'accuracy',
        'accuracy',
        'accuracy-avg',
        t('series-accuracy', {
          defaultValue: 'Daily median accuracy',
        }),
        t('series-avg', {
          defaultValue: '7-day average',
        }),
      ),
    };
  }, [data, t]);

  // The chart primitive owns no strings: its words are translated here, in the `rmhtype-progress` namespace.
  const chartLabels = useMemo(
    () => ({
      showChart: t('chart-show-chart', {
        defaultValue: 'Show as chart',
      }),
      showTable: t('chart-show-table', {
        defaultValue: 'Show as table',
      }),
      day: t('chart-table-day', {
        defaultValue: 'Day',
      }),
      points: t('chart-points', {
        defaultValue: 'Data points',
      }),
      seriesSummary: (v: { label: string; first: string; last: string; min: string; max: string }) =>
        t('chart-series-summary', {
          defaultValue: '{{label}}: from {{first}} to {{last}}, lowest {{min}}, highest {{max}}.',
          ...v,
        }),
    }),
    [t],
  );

  const rangeTabs = PROGRESS_RANGES.map((id) => ({
    id,
    label:
      id === '30d'
        ? t('range-30d', {
            defaultValue: '30 days',
          })
        : id === '90d'
          ? t('range-90d', {
              defaultValue: '90 days',
            })
          : id === '1y'
            ? t('range-1y', {
                defaultValue: '1 year',
              })
            : t('range-all', {
                defaultValue: 'All time',
              }),
  }));
  const modeTabs = PROGRESS_MODES.map((id) => ({
    id,
    label:
      id === 'all'
        ? t('mode-all', {
            defaultValue: 'All runs',
          })
        : id === 'solo'
          ? t('mode-solo', {
              defaultValue: 'Solo',
            })
          : t('mode-races', {
              defaultValue: 'Races',
            }),
  }));

  const openRun = (cursor: string) => {
    setRunsFrom(cursor);
    runsRef.current?.scrollIntoView({
      block: 'start',
    });
  };

  return (
    <div className="app-page">
      <RmhTypeHeader backLabel="RMH Type" backHref="/rmhtype" />
      <div
        className="mx-auto w-full max-w-4xl flex-1 p-4 md:p-8"
        style={{
          ['--chart-ink' as string]: 'var(--app-text)',
          ['--chart-ink-2' as string]: 'var(--app-text-muted)',
          ['--chart-rule' as string]: 'var(--app-border)',
        }}
      >
        <h1
          className="text-3xl font-semibold"
          style={{
            fontFamily: 'var(--app-font-display)',
          }}
        >
          {t('title', {
            defaultValue: 'Your progress',
          })}
        </h1>
        <p className="mt-2 max-w-xl text-app-text-muted">
          {t('intro', {
            defaultValue:
              'Typing speed and accuracy over time, from your races and standard solo runs. Custom and practice tests are not stored, so they are not included.',
          })}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Tabs
            tabs={rangeTabs}
            value={range}
            onChange={(id) => {
              setRunsFrom(null);
              setRange(id as ProgressRange);
            }}
            aria-label={t('range-label', {
              defaultValue: 'Range',
            })}
          />
          <Tabs
            tabs={modeTabs}
            value={mode}
            onChange={(id) => {
              setRunsFrom(null);
              setMode(id as ProgressMode);
            }}
            aria-label={t('mode-label', {
              defaultValue: 'Runs to include',
            })}
          />
        </div>

        {failed ? (
          <div className="mt-8">
            <p className="text-app-danger">
              {t('load-failed', {
                defaultValue: 'Could not load your progress.',
              })}
            </p>
            <button type="button" className="mt-2 underline hover:text-app-text" onClick={() => load()}>
              {t('retry', {
                defaultValue: 'Try again',
              })}
            </button>
          </div>
        ) : data === null || charts === null ? (
          <div
            className="mt-8 space-y-4"
            role="status"
            aria-label={t('loading', {
              defaultValue: 'Loading your progress',
            })}
          >
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className={arrival}>
            <div className="mt-8">
              <ProgressSummary summary={data.summary} hasPrevious={RANGE_DAYS[range] !== null} />
              {data.capped ? (
                <p className="mt-2 text-xs text-app-text-muted">
                  {t('capped', {
                    defaultValue: 'Figures cover your 5,000 most recent runs.',
                  })}
                </p>
              ) : null}
            </div>

            {data.daily.length === 0 ? (
              <div className="mt-10 border-t border-app-border pt-6">
                <p className="t-heading">
                  {t('empty-title', {
                    defaultValue: 'No runs in this range',
                  })}
                </p>
                <p className="mt-1 max-w-prose text-app-text-muted">
                  {t('empty-body', {
                    defaultValue: 'Finish a race or a standard solo run and your trend starts here.',
                  })}
                </p>
              </div>
            ) : (
              <>
                <section className="mt-10 border-t border-app-border pt-6">
                  <LineChart
                    series={charts.wpm}
                    label={t('chart-wpm', {
                      defaultValue: 'Speed in words per minute',
                    })}
                    labels={chartLabels}
                    formatY={f.number}
                    formatX={f.day}
                  />
                  {data.truncated ? (
                    <p className="mt-2 text-xs text-app-text-muted">
                      {t('truncated', {
                        defaultValue: 'The chart shows your latest 400 days.',
                      })}
                    </p>
                  ) : null}
                </section>
                <section className="mt-10 border-t border-app-border pt-6">
                  <LineChart
                    series={charts.accuracy}
                    label={t('chart-accuracy', {
                      defaultValue: 'Accuracy in percent',
                    })}
                    labels={chartLabels}
                    formatY={f.accuracy}
                    formatX={f.day}
                  />
                </section>
              </>
            )}

            <section className="mt-10 border-t border-app-border pt-6" aria-labelledby="bests-heading">
              <h2 id="bests-heading" className="t-heading mb-3">
                {t('bests-title', {
                  defaultValue: 'Personal bests',
                })}
              </h2>
              <ProgressBests bests={data.bests} onOpenRun={openRun} />
            </section>
          </div>
        )}

        <section
          ref={runsRef}
          className="mt-10 scroll-mt-4 border-t border-app-border pt-6"
          aria-labelledby="runs-heading"
        >
          <h2 id="runs-heading" className="t-heading mb-3">
            {t('runs-title', {
              defaultValue: 'Recent runs',
            })}
          </h2>
          <ProgressRuns mode={mode} start={runsFrom} onBackToLatest={() => setRunsFrom(null)} />
        </section>

        <GhostClear />
      </div>
    </div>
  );
}

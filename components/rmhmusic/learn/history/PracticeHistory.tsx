/**
 * PracticeHistory — `/rmhmusic/history`: the learner's practice log. Minutes this week and last,
 * the days of this week that met the daily goal (the goal counts activities, so the page says
 * "3 of 5 days with your goal met" and shows minutes separately), a bar per day for a chosen week,
 * a year heatmap, the recent-activity list, and Clear history.
 *
 * Charts carry a text alternative (the shared BarChart and DayHeatmap each hold a visually hidden
 * table of the same numbers). The heatmap shows a day's minutes, or its activity count when no
 * minutes are known, so a day of finished lessons is never blank. Days are the learner's own, from
 * the browser's time zone.
 */
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart } from '@/components/ui/bar-chart';
import { DayHeatmap } from '@/components/ui/day-heatmap';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { firstDayOfWeek } from '@/lib/locale-week';
import { addDays } from '@/lib/calendar/tz';
import { HEATMAP_DAYS, MAX_WEEK_OFFSET, heatDays, weekBounds, weekFrom } from '@/lib/rmhmusic/history';
import { clearPracticeApi, getPracticeSummaryApi } from '@/lib/rmhmusic/history.contract';
import { formatMinutes } from '@/lib/rmhstudy/history';
import { SECONDARY_BUTTON, TEXT_BUTTON } from '../buttons';
import { Shell } from '../LessonScreen';
import { PracticeList } from './PracticeList';

/** The app tier's ink for the shared charts, set once on the container. */
const CHART_INK = {
  '--chart-ink': 'var(--app-accent)',
  '--heat-ink': 'var(--app-accent)',
  '--heat-ground': 'var(--app-bg-subtle)',
} as React.CSSProperties;

function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function PracticeHistory() {
  const { t, i18n } = useTranslation('music-history');
  const locale = i18n.language;
  const firstDay = firstDayOfWeek(locale);
  const timeZone = viewerTimeZone();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [weekOffset, setWeekOffset] = useState(0);
  const [clearing, setClearing] = useState(false);

  const query = useQuery({
    queryKey: [
      'rmhmusic',
      'history',
      'summary',
      {
        weekOffset,
        firstDay,
        timeZone,
      },
    ],
    queryFn: ({ signal }) =>
      api(getPracticeSummaryApi, {
        query: {
          week: weekOffset,
          firstDay,
          ...(timeZone
            ? {
                tz: timeZone,
              }
            : {}),
        },
        signal,
      }),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const data = query.data;
  const arrival = useArrival(!!data);

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dateFormats = useMemo(() => {
    const make = (options: Intl.DateTimeFormatOptions) => {
      const f = new Intl.DateTimeFormat(locale, {
        ...options,
        timeZone: 'UTC',
      });
      return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
    };
    return {
      day: make({
        weekday: 'short',
        day: 'numeric',
      }),
      long: make({
        dateStyle: 'medium',
      }),
      short: make({
        month: 'short',
        day: 'numeric',
      }),
    };
  }, [locale]);
  const minutes = (n: number) => formatMinutes(n, locale);

  const weekOptions = useMemo(() => {
    const current = weekBounds(Date.now(), timeZone ?? 'UTC', firstDay);
    return Array.from(
      {
        length: MAX_WEEK_OFFSET + 1,
      },
      (_, offset) => ({
        offset,
        ...weekFrom(addDays(current.start, -7 * offset)),
      }),
    );
  }, [firstDay, timeZone]);

  async function clear() {
    const ok = await confirm({
      title: t('clear-confirm-title', {
        defaultValue: 'Clear your practice history?',
      }),
      description: t('clear-confirm-body', {
        defaultValue: 'This deletes every entry in the log. Your stars, best scores and streak stay as they are.',
      }),
      confirmLabel: t('clear-confirm', {
        defaultValue: 'Clear history',
      }),
      cancelLabel: t('clear-cancel', {
        defaultValue: 'Cancel',
      }),
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      await api(clearPracticeApi, {});
      toast.success(
        t('clear-done', {
          defaultValue: 'Practice history cleared.',
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: ['rmhmusic', 'history'],
      });
    } catch {
      toast.error(
        t('clear-failed', {
          defaultValue: 'Could not clear your history. Try again.',
        }),
      );
    } finally {
      setClearing(false);
    }
  }

  const title = t('title', {
    defaultValue: 'Practice history',
  });

  if (query.isError && !data) {
    const signedOut = query.error instanceof HttpError && query.error.status === 401;
    return (
      <Shell title={title}>
        <div role="alert" className="space-y-3">
          <p className="text-app-text-muted">
            {signedOut
              ? t('signed-out', {
                  defaultValue: 'Your session ended. Sign in again to see your history.',
                })
              : t('error-title', {
                  defaultValue: 'Could not load your practice history.',
                })}
          </p>
          {signedOut ? (
            <Link
              to="/login"
              search={{
                callbackURL: '/rmhmusic/history',
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
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell title={title} busy>
        <div className="space-y-6" aria-busy>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Shell>
    );
  }

  const week = data.week;
  const weekTotal = week.days.reduce((a, d) => a + d.minutes, 0);
  const weekMax = Math.max(0, ...week.days.map((d) => d.minutes));
  const weekLabel = t('week-chart-label', {
    defaultValue: 'Minutes of practice per day',
  });
  const year = heatDays(data.year, data.today, HEATMAP_DAYS);
  const yearBest = year.reduce<{
    date: string;
    count: number;
  } | null>((a, d) => (!a || d.count > a.count ? d : a), null);
  const yearActive = year.filter((d) => d.count > 0).length;
  const yearLabel = t('year-label', {
    defaultValue: 'Practice per day, last 365 days',
  });
  const empty = data.totalEntries === 0;

  return (
    <Shell title={title}>
      <div className={`space-y-8 ${arrival ?? ''}`} style={CHART_INK}>
        {empty ? (
          <p className="text-app-text-muted">
            {t('empty-description', {
              defaultValue:
                'No practice yet. Finish a lesson, a song, a sprint or a card review and your history starts here.',
            })}
          </p>
        ) : null}

        <section aria-labelledby="rmm-history-totals">
          <h2 id="rmm-history-totals" className="sr-only">
            {t('totals-heading', {
              defaultValue: 'This week and last week',
            })}
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Figure
              label={t('this-week', {
                defaultValue: 'This week',
              })}
            >
              {minutes(data.thisWeekMinutes)}
            </Figure>
            <Figure
              label={t('last-week', {
                defaultValue: 'Last week',
              })}
            >
              {minutes(data.lastWeekMinutes)}
            </Figure>
            <Figure
              label={t('goal-days-label', {
                defaultValue: 'Daily goal',
              })}
            >
              {t('goal-days', {
                defaultValue: '{{met}} of {{count}} days with your goal met',
                defaultValue_one: '{{met}} of {{count}} day with your goal met',
                count: data.goalDays.elapsed,
                met: number.format(data.goalDays.met),
              })}
            </Figure>
          </dl>
          <p className="mt-3 text-xs text-app-text-muted">
            {t('goal-note', {
              defaultValue:
                'A day meets your goal with {{count}} finished activities: lessons, songs, sprints or card reviews.',
              defaultValue_one:
                'A day meets your goal with {{count}} finished activity: a lesson, a song, a sprint or a card review.',
              count: data.dailyGoal,
            })}
          </p>
        </section>

        <section className="space-y-3" aria-labelledby="rmm-history-week">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="rmm-history-week" className="text-lg font-semibold text-app-text">
              {t('week-heading', {
                defaultValue: 'Days',
              })}
            </h2>
            <Select
              tier="app"
              aria-label={t('week-select', {
                defaultValue: 'Week',
              })}
              value={String(weekOffset)}
              onChange={(e) => setWeekOffset(Number(e.target.value))}
            >
              {weekOptions.map((o) => (
                <option key={o.offset} value={String(o.offset)}>
                  {o.offset === 0
                    ? t('week-option-this', {
                        defaultValue: 'This week',
                      })
                    : t('week-option-range', {
                        defaultValue: '{{start}} to {{end}}',
                        start: dateFormats.short(o.start),
                        end: dateFormats.short(o.end),
                      })}
                </option>
              ))}
            </Select>
          </div>
          <BarChart
            label={weekLabel}
            summary={t('week-summary', {
              defaultValue: '{{label}}, {{start}} to {{end}}: {{total}} in total, up to {{max}} in one day.',
              label: weekLabel,
              start: dateFormats.long(week.start),
              end: dateFormats.long(week.days[6]?.date ?? week.start),
              total: minutes(weekTotal),
              max: minutes(weekMax),
            })}
            columns={{
              label: t('table-day', {
                defaultValue: 'Day',
              }),
              value: t('table-minutes', {
                defaultValue: 'Practice time',
              }),
            }}
            bars={week.days.map((d) => ({
              label: dateFormats.day(d.date),
              value: d.minutes,
            }))}
            format={minutes}
          />
        </section>

        <section className="space-y-3" aria-labelledby="rmm-history-year">
          <h2 id="rmm-history-year" className="text-lg font-semibold text-app-text">
            {t('year-heading', {
              defaultValue: 'Last year',
            })}
          </h2>
          <DayHeatmap
            days={year}
            label={yearLabel}
            summary={
              yearBest && yearBest.count > 0
                ? t('year-summary', {
                    count: Number(number.format(yearActive)),
                    defaultValue_one: '{{label}}: practised on {{days}} day. Busiest day {{date}}.',
                    defaultValue: '{{label}}: practised on {{days}} days. Busiest day {{date}}.',
                    label: yearLabel,
                    days: number.format(yearActive),
                    date: dateFormats.long(yearBest.date),
                  })
                : t('year-summary-empty', {
                    defaultValue: '{{label}}: no practice yet.',
                    label: yearLabel,
                  })
            }
            columns={{
              date: t('table-day', {
                defaultValue: 'Day',
              }),
              count: t('table-heat', {
                defaultValue: 'Minutes, or activities when no time is known',
              }),
            }}
          />
        </section>

        <PracticeList />

        <div>
          <button
            type="button"
            disabled={clearing || empty}
            onClick={() => void clear()}
            className={`${SECONDARY_BUTTON} text-app-danger`}
          >
            {t('clear-button', {
              defaultValue: 'Clear history',
            })}
          </button>
          <p className="mt-2 text-xs text-app-text-muted">
            {t('clear-note', {
              defaultValue: 'Clearing removes this log only. Stars, best scores and your streak stay.',
            })}
          </p>
        </div>
      </div>
    </Shell>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-app-text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold text-app-text">{children}</dd>
    </div>
  );
}

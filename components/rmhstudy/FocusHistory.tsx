import { deviceTimeZone } from '@/lib/core/zoned-time';
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { BarChart } from '@/components/ui/bar-chart';
import { Button } from '@/components/ui/button';
import { DayHeatmap } from '@/components/ui/day-heatmap';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import RmhStudyHeader from '@/components/rmhstudy/RmhStudyHeader';
import FocusGoal from '@/components/rmhstudy/FocusGoal';
import FocusSessions from '@/components/rmhstudy/FocusSessions';
import { firstDayOfWeek } from '@/lib/locale-week';
import {
  HEATMAP_DAYS,
  MAX_WEEK_OFFSET,
  fillMinutes,
  formatMinutes,
  weekBounds,
  weekFrom,
} from '@/lib/rmhstudy/history';
import { getFocusHistoryApi } from '@/lib/rmhstudy/history.contract';
import { addDays } from '@/lib/study/stats';

/** The RMHStudy app tier's ink for the shared charts, set once on the container. */
const CHART_INK = {
  '--chart-ink': 'var(--app-accent)',
  '--heat-ink': 'var(--app-accent)',
  '--heat-ground': 'var(--app-bg-subtle)',
} as React.CSSProperties;

/** `/rmhstudy/history`: this week and last, the weekly goal, daily bars, a year heatmap, records, runs. */
export default function FocusHistory() {
  const { t, i18n } = useTranslation('rmhstudy-focus');
  const { t: ts } = useTranslation('rmhstudy-streaks');
  const locale = i18n.language;
  const firstDay = firstDayOfWeek(locale);
  const timeZone = deviceTimeZone();
  const [weekOffset, setWeekOffset] = useState(0);

  const query = useQuery({
    queryKey: [
      getFocusHistoryApi.path,
      null,
      {
        weekOffset,
        firstDay,
        timeZone,
      },
    ],
    queryFn: ({ signal }) =>
      api(getFocusHistoryApi, {
        query: {
          weekOffset,
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
  const dayLabel = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [locale]);
  const dateOf = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [locale]);
  const shortDate = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [locale]);
  const minutes = (n: number) => formatMinutes(n, locale);

  const weekOptions = useMemo(() => {
    const current = weekBounds(new Date(), timeZone ?? 'UTC', firstDay);
    return Array.from(
      {
        length: MAX_WEEK_OFFSET + 1,
      },
      (_, offset) => {
        const week = weekFrom(addDays(current.start, -7 * offset));
        return {
          offset,
          start: week.start,
          end: week.end,
        };
      },
    );
  }, [firstDay, timeZone]);

  const header = (
    <RmhStudyHeader
      backLabel={t('back', {
        defaultValue: 'Study',
      })}
      backHref="/rmhstudy"
    />
  );
  const heading = (
    <h1
      className="text-3xl font-bold"
      style={{
        fontFamily: 'var(--app-font-display)',
      }}
    >
      {t('title', {
        defaultValue: 'Focus history',
      })}
    </h1>
  );

  if (query.isError && !data) {
    return (
      <div className="app-page">
        {header}
        <div className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-3xl space-y-4">
            {heading}
            <p className="text-sm text-app-text-muted">
              {t('error-title', {
                defaultValue: 'Could not load your focus history.',
              })}
            </p>
            <Button variant="default" onClick={() => void query.refetch()}>
              {t('retry', {
                defaultValue: 'Try again',
              })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-page">
        {header}
        <div className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-3xl space-y-6" aria-busy>
            {heading}
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const week = data.week;
  const weekBars = week.days.map((d) => ({
    label: dayLabel(d.date),
    value: d.minutes,
  }));
  const weekSum = week.days.reduce((a, d) => a + d.minutes, 0);
  const weekMax = Math.max(0, ...week.days.map((d) => d.minutes));
  const weekLabel = t('week-chart-label', {
    defaultValue: 'Focus minutes per day',
  });
  const year = fillMinutes(data.year, data.today, HEATMAP_DAYS);
  const yearTotal = year.reduce((a, d) => a + d.minutes, 0);
  const yearBest = year.reduce<{
    date: string;
    minutes: number;
  } | null>((a, d) => (!a || d.minutes > a.minutes ? d : a), null);
  const yearLabel = t('year-label', {
    defaultValue: 'Focus minutes per day, last 365 days',
  });
  const { records } = data;
  const empty = records.totalSessions === 0;

  return (
    <div className="app-page">
      {header}
      <div className="flex-1 p-4 md:p-8">
        <div className={`mx-auto max-w-3xl space-y-8 ${arrival ?? ''}`} style={CHART_INK}>
          {heading}

          {empty ? (
            <div className="space-y-2">
              <p className="text-lg font-semibold">
                {t('empty-title', {
                  defaultValue: 'No focus time yet',
                })}
              </p>
              <p className="text-sm text-app-text-muted">
                {t('empty-description', {
                  defaultValue: 'Finish a focus run in a room and your history starts here.',
                })}
              </p>
              <Link to="/rmhstudy" className="inline-block text-sm underline">
                {t('empty-action', {
                  defaultValue: 'Go to rooms',
                })}
              </Link>
            </div>
          ) : null}

          <section aria-labelledby="focus-totals">
            <h2 id="focus-totals" className="sr-only">
              {t('totals-heading', {
                defaultValue: 'This week and last week',
              })}
            </h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                label={t('streak', {
                  defaultValue: 'Current streak',
                })}
              >
                {t('streak-days', {
                  defaultValue: '{{count}} days',
                  defaultValue_one: '{{count}} day',
                  count: data.streak.current,
                })}
              </Figure>
              <Figure
                label={ts('longest-streak', {
                  defaultValue: 'Longest streak',
                })}
              >
                {t('streak-days', {
                  defaultValue: '{{count}} days',
                  defaultValue_one: '{{count}} day',
                  count: data.streak.longest,
                })}
              </Figure>
              <Figure
                label={ts('break-total', {
                  defaultValue: 'Break time this week',
                })}
              >
                {data.thisWeekBreaks ? minutes(data.thisWeekBreaks.breakMinutes) : '—'}
              </Figure>
              <Figure
                label={ts('break-ratio', {
                  defaultValue: 'Break to focus',
                })}
              >
                {data.thisWeekBreaks?.focusPerBreak
                  ? ts('break-ratio-sentence', {
                      defaultValue: '1 minute of break for every {{count}} of focus',
                      defaultValue_one: '1 minute of break for every minute of focus',
                      count: data.thisWeekBreaks.focusPerBreak,
                    })
                  : '—'}
              </Figure>
            </dl>
          </section>

          <FocusGoal goalMinutes={data.goalMinutes} thisWeekMinutes={data.thisWeekMinutes} />

          <section className="space-y-3" aria-labelledby="focus-week">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="focus-week" className="text-lg font-semibold">
                {t('week-heading', {
                  defaultValue: 'Days',
                })}
              </h2>
              <select
                aria-label={t('week-select', {
                  defaultValue: 'Week',
                })}
                value={weekOffset}
                onChange={(e) => setWeekOffset(Number(e.target.value))}
                className="surface-field h-10 rounded-app-sm px-3 text-sm text-app-text"
              >
                {weekOptions.map((o) => (
                  <option key={o.offset} value={o.offset}>
                    {o.offset === 0
                      ? t('week-option-this', {
                          defaultValue: 'This week',
                        })
                      : t('week-option-range', {
                          defaultValue: '{{start}} to {{end}}',
                          start: shortDate(o.start),
                          end: shortDate(o.end),
                        })}
                  </option>
                ))}
              </select>
            </div>
            <BarChart
              label={weekLabel}
              summary={t('week-summary', {
                defaultValue: '{{label}}, {{start}} to {{end}}: {{total}} in total, up to {{max}} in one day.',
                label: weekLabel,
                start: dateOf(week.start),
                end: dateOf(week.days[6]?.date ?? week.start),
                total: minutes(weekSum),
                max: minutes(weekMax),
              })}
              columns={{
                label: t('table-day', {
                  defaultValue: 'Day',
                }),
                value: t('table-focus', {
                  defaultValue: 'Focus time',
                }),
              }}
              bars={weekBars}
              format={minutes}
            />
          </section>

          <section className="space-y-3" aria-labelledby="focus-year">
            <h2 id="focus-year" className="text-lg font-semibold">
              {t('year-heading', {
                defaultValue: 'Last year',
              })}
            </h2>
            <DayHeatmap
              marked={{
                days: new Set(data.streak.days),
                label: ts('streak-day', {
                  defaultValue: 'Streak day',
                }),
                column: ts('streak-column', {
                  defaultValue: 'Streak',
                }),
              }}
              days={year.map((d) => ({
                date: d.date,
                count: d.minutes,
              }))}
              label={yearLabel}
              summary={
                yearBest && yearBest.minutes > 0
                  ? t('year-summary', {
                      defaultValue: '{{label}}: {{total}} in total. Busiest day {{date}} with {{max}}.',
                      label: yearLabel,
                      total: minutes(yearTotal),
                      date: dateOf(yearBest.date),
                      max: minutes(yearBest.minutes),
                    })
                  : t('year-summary-empty', {
                      defaultValue: '{{label}}: no focus time.',
                      label: yearLabel,
                    })
              }
              columns={{
                date: t('table-date', {
                  defaultValue: 'Date',
                }),
                count: t('table-minutes', {
                  defaultValue: 'Minutes',
                }),
              }}
            />
          </section>

          <section className="space-y-3" aria-labelledby="focus-records">
            <h2 id="focus-records" className="text-lg font-semibold">
              {t('records-heading', {
                defaultValue: 'Records',
              })}
            </h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure
                label={t('record-longest', {
                  defaultValue: 'Longest run',
                })}
              >
                {records.longestRunMinutes > 0 ? minutes(records.longestRunMinutes) : '–'}
              </Figure>
              <Figure
                label={t('record-day', {
                  defaultValue: 'Best day',
                })}
              >
                {records.bestDay ? (
                  <>
                    {minutes(records.bestDay.minutes)}
                    <span className="block text-sm text-app-text-muted">{dateOf(records.bestDay.date)}</span>
                  </>
                ) : (
                  '–'
                )}
              </Figure>
              <Figure
                label={t('record-week', {
                  defaultValue: 'Best week',
                })}
              >
                {records.bestWeek ? (
                  <>
                    {minutes(records.bestWeek.minutes)}
                    <span className="block text-sm text-app-text-muted">
                      {t('record-week-of', {
                        defaultValue: 'Week of {{date}}',
                        date: shortDate(records.bestWeek.start),
                      })}
                    </span>
                  </>
                ) : (
                  '–'
                )}
              </Figure>
              <Figure
                label={t('record-sessions', {
                  defaultValue: 'Total sessions',
                })}
              >
                {number.format(records.totalSessions)}
              </Figure>
            </dl>
            <p className="text-sm text-app-text-muted">
              {t('records-note', {
                defaultValue: 'Best day and best week cover the last 400 days.',
              })}
            </p>
          </section>

          <FocusSessions timeZone={timeZone} />
        </div>
      </div>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-app-text-muted">{label}</dt>
      <dd className="m-0 text-lg font-semibold">{children}</dd>
    </div>
  );
}

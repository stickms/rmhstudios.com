import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { StudyTabs } from '@/components/feed/StudyTabs';
import { useSession } from '@/components/Providers';
import { ReminderSettings } from '@/components/study/ReminderSettings';
import { BarChart } from '@/components/ui/bar-chart';
import { Button } from '@/components/ui/button';
import { DayHeatmap } from '@/components/ui/day-heatmap';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { firstDayOfWeek } from '@/lib/locale-week';
import { HEATMAP_DAYS, addDays, fillDays } from '@/lib/study/stats';
import { getStudyStatsApi, type RetentionStat } from '@/lib/study/stats.contract';

const ALL_DECKS = '';

function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** The member's own flashcard statistics. `deckId` filters every section to one deck. */
export function StatsPage({
  deckId,
  onDeckChange,
}: {
  deckId?: string | undefined;
  onDeckChange: (deckId: string | undefined) => void;
}) {
  const { t, i18n } = useTranslation('study-stats');
  const locale = i18n.language;
  const { data: session, isPending: sessionPending } = useSession();
  const signedIn = !!session?.user;

  const timeZone = viewerTimeZone();
  const query = useQuery({
    ...apiQuery(getStudyStatsApi, {
      query: { ...(deckId ? { deckId } : {}), ...(timeZone ? { tz: timeZone } : {}) },
    }),
    enabled: signedIn,
    retry: false,
  });
  const stats = query.data;
  const arrival = useArrival(!!stats);

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const percent = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }),
    [locale],
  );
  const dateOf = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [locale]);
  const shortDate = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [locale]);

  const header = (
    <>
      <ColumnHeader icon={BarChart3} title={t('title', { defaultValue: 'Study statistics' })} />
      <StudyTabs active="/study/stats" />
    </>
  );

  if (sessionPending) {
    return (
      <div>
        {header}
        <div className="space-y-4 p-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }
  if (!signedIn) {
    return (
      <div>
        {header}
        <SignedOutPrompt
          title={t('signed-out-title', { defaultValue: 'Sign in to see your study statistics' })}
          callbackURL="/study/stats"
        />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div>
        {header}
        <EmptyState
          title={t('error-title', { defaultValue: 'Could not load your statistics' })}
          action={
            <Button variant="default" onClick={() => void query.refetch()}>
              {t('retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      </div>
    );
  }
  if (!stats) {
    return (
      <div>
        {header}
        <div className="space-y-4 p-4" aria-busy>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );
  }

  const days = fillDays(stats.days, stats.today, HEATMAP_DAYS);
  const todayCount = days[days.length - 1]?.count ?? 0;
  const weekOffset = (new Date(`${stats.today}T00:00:00Z`).getUTCDay() - firstDayOfWeek(locale) + 7) % 7;
  const weekStart = addDays(stats.today, -weekOffset);
  const weekCount = days.filter((d) => d.date >= weekStart).reduce((a, d) => a + d.count, 0);
  const rows = stats.decks.filter((d) => !deckId || d.id === deckId);
  const hasAnything = stats.since !== null || stats.decks.length > 0;

  const heatmapLabel = t('heatmap-label', { defaultValue: 'Reviews per day, last 365 days' });
  const heatmapMax = days.reduce<{ date: string; count: number } | null>(
    (a, d) => (!a || d.count > a.count ? d : a),
    null,
  );
  const heatmapSummary =
    heatmapMax && heatmapMax.count > 0
      ? t('heatmap-summary', {
          count: Number(days.length),
          defaultValue_one: '{{label}}: {{total}} in {{days}} day. Busiest day {{date}} with {{max}}.',
          defaultValue: '{{label}}: {{total}} in {{days}} days. Busiest day {{date}} with {{max}}.',
          label: heatmapLabel,
          total: number.format(days.reduce((a, d) => a + d.count, 0)),
          days: days.length,
          date: dateOf(heatmapMax.date),
          max: number.format(heatmapMax.count),
        })
      : t('heatmap-summary-empty', {
          count: Number(days.length),
          defaultValue_one: '{{label}}: nothing in {{days}} day.',
          defaultValue: '{{label}}: nothing in {{days}} days.',
          label: heatmapLabel,
          days: days.length,
        });
  const forecastLabel = t('forecast-label', { defaultValue: 'Cards due per day, next 30 days' });

  const retentionText = (r: RetentionStat) =>
    r.rate === null
      ? t('retention-too-few', { defaultValue: 'Not enough reviews yet' })
      : t('retention-value', {
          defaultValue_one: '{{rate}} of {{count}} review',
          defaultValue: '{{rate}} of {{count}} reviews',
          rate: percent.format(r.rate),
          count: r.samples,
        });

  return (
    <div className={arrival}>
      {header}
      <ReminderSettings />
      <div className="space-y-6 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="t-meta">
            {stats.since
              ? t('history-since', {
                  defaultValue: 'History since {{date}}',
                  date: dateOf(stats.since),
                })
              : t('history-none', { defaultValue: 'No reviews recorded yet' })}
          </p>
          {stats.decks.length > 0 || deckId ? (
            <Select
              aria-label={t('deck-filter', { defaultValue: 'Deck' })}
              controlSize="sm"
              value={deckId ?? ALL_DECKS}
              onChange={(e) => onDeckChange(e.target.value === ALL_DECKS ? undefined : e.target.value)}
            >
              <option value={ALL_DECKS}>{t('all-decks', { defaultValue: 'All decks' })}</option>
              {stats.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          ) : null}
        </div>

        {!hasAnything ? (
          <EmptyState
            title={t('empty-title', { defaultValue: 'Nothing to show yet' })}
            description={t('empty-description', {
              defaultValue: 'Review some cards and your statistics appear here.',
            })}
            action={
              <Link to="/study">
                <Button variant="default">{t('empty-action', { defaultValue: 'Go to decks' })}</Button>
              </Link>
            }
          />
        ) : (
          <>
            <section className="space-y-3" aria-labelledby="stats-reviews">
              <h2 id="stats-reviews" className="t-heading">
                {t('reviews-heading', { defaultValue: 'Reviews' })}
              </h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Figure label={t('reviews-today', { defaultValue: 'Reviews today' })}>
                  {number.format(todayCount)}
                </Figure>
                <Figure label={t('reviews-week', { defaultValue: 'Reviews this week' })}>
                  {number.format(weekCount)}
                </Figure>
                <Figure label={t('streak-current', { defaultValue: 'Current streak' })}>
                  {t('streak-days', {
                    defaultValue: '{{count}} days',
                    defaultValue_one: '{{count}} day',
                    count: stats.streak.current,
                  })}
                </Figure>
                <Figure label={t('streak-longest', { defaultValue: 'Longest streak' })}>
                  {t('streak-days', {
                    defaultValue: '{{count}} days',
                    defaultValue_one: '{{count}} day',
                    count: stats.streak.longest,
                  })}
                </Figure>
              </dl>
              <DayHeatmap
                days={days}
                label={heatmapLabel}
                summary={heatmapSummary}
                columns={{
                  date: t('table-date', { defaultValue: 'Date' }),
                  count: t('table-count', { defaultValue: 'Count' }),
                }}
              />
            </section>

            <section className="space-y-3 border-t border-site-border pt-6" aria-labelledby="stats-forecast">
              <h2 id="stats-forecast" className="t-heading">
                {t('forecast-heading', { defaultValue: 'Due in the next 30 days' })}
              </h2>
              <BarChart
                label={forecastLabel}
                summary={t('chart-summary', {
                  defaultValue: '{{label}}: {{total}} in total, up to {{max}} in one bar.',
                  label: forecastLabel,
                  total: number.format(stats.forecast.reduce((a, f) => a + f.count, 0)),
                  max: number.format(Math.max(0, ...stats.forecast.map((f) => f.count))),
                })}
                columns={{
                  label: t('table-day', { defaultValue: 'Day' }),
                  value: t('table-value', { defaultValue: 'Value' }),
                }}
                bars={stats.forecast.map((f) => ({ label: shortDate(f.date), value: f.count }))}
              />
              <p className="t-meta">{t('forecast-note', { defaultValue: 'Overdue cards count on today.' })}</p>
            </section>

            <section className="space-y-3 border-t border-site-border pt-6" aria-labelledby="stats-retention">
              <h2 id="stats-retention" className="t-heading">
                {t('retention-heading', { defaultValue: 'Retention, last 30 days' })}
              </h2>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <Figure label={t('retention-young', { defaultValue: 'Young cards (1 to 20 days)' })}>
                  {retentionText(stats.retention.young)}
                </Figure>
                <Figure label={t('retention-mature', { defaultValue: 'Mature cards (21 days or more)' })}>
                  {retentionText(stats.retention.mature)}
                </Figure>
              </dl>
              <p className="t-meta">
                {t('retention-note', {
                  defaultValue: 'Reviews not graded Again, on cards already scheduled at that age.',
                })}
              </p>
            </section>

            <section className="space-y-3 border-t border-site-border pt-6" aria-labelledby="stats-decks">
              <h2 id="stats-decks" className="t-heading">
                {t('decks-heading', { defaultValue: 'Decks' })}
              </h2>
              {rows.length === 0 ? (
                <p className="t-body text-site-text-muted">{t('decks-none', { defaultValue: 'No decks to show.' })}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-site-border">
                        <th scope="col" className="t-label py-2 pe-3 font-semibold">
                          {t('col-deck', { defaultValue: 'Deck' })}
                        </th>
                        <th scope="col" className="t-label px-2 py-2 text-end font-semibold">
                          {t('col-cards', { defaultValue: 'Cards' })}
                        </th>
                        <th scope="col" className="t-label px-2 py-2 text-end font-semibold">
                          {t('col-new', { defaultValue: 'New' })}
                        </th>
                        <th scope="col" className="t-label px-2 py-2 text-end font-semibold">
                          {t('col-learning', { defaultValue: 'Learning' })}
                        </th>
                        <th scope="col" className="t-label px-2 py-2 text-end font-semibold">
                          {t('col-young', { defaultValue: 'Young' })}
                        </th>
                        <th scope="col" className="t-label px-2 py-2 text-end font-semibold">
                          {t('col-mature', { defaultValue: 'Mature' })}
                        </th>
                        <th scope="col" className="t-label px-2 py-2 text-end font-semibold">
                          {t('col-due', { defaultValue: 'Due today' })}
                        </th>
                        <th scope="col" className="t-label py-2 ps-3 font-semibold">
                          {t('col-last', { defaultValue: 'Last studied' })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d) => (
                        <tr key={d.id} className="border-b border-site-border">
                          <th scope="row" className="t-body py-2 pe-3 font-medium">
                            <Link to="/study/$deckId" params={{ deckId: d.id }} className="underline">
                              {d.title}
                            </Link>
                          </th>
                          {[d.cards, d.newCards, d.learning, d.young, d.mature, d.dueToday].map((n, i) => (
                            <td key={i} className="t-meta px-2 py-2 text-end">
                              {number.format(n)}
                            </td>
                          ))}
                          <td className="t-meta py-2 ps-3">
                            {d.lastStudied
                              ? dateOf(d.lastStudied.slice(0, 10))
                              : t('never-studied', { defaultValue: 'Never' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="t-label">{label}</dt>
      <dd className="t-meta m-0 text-site-text">{children}</dd>
    </div>
  );
}

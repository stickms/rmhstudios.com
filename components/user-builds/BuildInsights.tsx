/** s04-05 — per-build insights for the owner: totals against the previous period, a daily chart, releases and the biggest days. */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { apiQuery } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { BarChart } from '@/components/ui/bar-chart';
import { LineChart } from '@/components/ui/line-chart';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { getBuildInsightsApi } from '@/lib/builds/insights.contract';
import { BUILD_INSIGHT_RANGES, type BuildInsightRange, type BuildTotalKey, type Compared } from '@/lib/builds/insights';

export function BuildInsights({
  slug,
  range,
  onRangeChange,
}: {
  slug: string;
  range: BuildInsightRange;
  onRangeChange: (range: BuildInsightRange) => void;
}) {
  const { t, i18n } = useTranslation('build-insights');
  const locale = i18n.language;
  const [tableOpen, setTableOpen] = useState(false);

  const query = useQuery({
    ...apiQuery(getBuildInsightsApi, { params: { id: slug }, query: { range: String(range) as '7' | '30' | '90' } }),
    retry: false,
  });
  const data = query.data;
  const arrival = useArrival(!!data);

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const signed = useMemo(() => new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' }), [locale]);
  const shortDay = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [locale]);
  const longDay = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [locale]);

  const rangeTabs = (
    <Tabs
      aria-label={t('range-label', { defaultValue: 'Time range' })}
      idBase="build-insights-range"
      value={String(range)}
      onChange={(id) => onRangeChange(Number(id) as BuildInsightRange)}
      tabs={BUILD_INSIGHT_RANGES.map((days) => ({
        id: String(days),
        label: t('range-option', { defaultValue: 'Last {{days}} days', days }),
      }))}
    />
  );

  if (query.isError) {
    const missing = query.error instanceof HttpError && query.error.status === 404;
    return missing ? (
      <EmptyState
        title={t('not-found-title', { defaultValue: 'Build not found' })}
        description={t('not-found-body', { defaultValue: 'There is no build here that you can see insights for.' })}
        action={
          <Button asChild variant="default">
            <Link to="/create/builds/manage">{t('back-to-builds', { defaultValue: 'My builds' })}</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState
        title={t('error-title', { defaultValue: 'Could not load the insights' })}
        description={t('error-body', { defaultValue: 'Try again in a moment.' })}
        action={
          <Button variant="default" onClick={() => void query.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        }
      />
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {rangeTabs}
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const totalLabels: Record<BuildTotalKey, string> = {
    views: t('total-views', { defaultValue: 'First views' }),
    likes: t('total-likes', { defaultValue: 'Likes' }),
    comments: t('total-comments', { defaultValue: 'Comments' }),
    unlocks: t('total-unlocks', { defaultValue: 'Unlocks' }),
    coins: t('total-coins', { defaultValue: 'Coins from unlocks' }),
  };
  const totalKeys: BuildTotalKey[] = data.hasViews
    ? ['views', 'likes', 'comments', 'unlocks', 'coins']
    : ['likes', 'comments', 'unlocks', 'coins'];

  const figure = (key: BuildTotalKey, c: Compared) => (
    <div key={key} className="flex flex-col gap-0.5 border-b border-site-border py-3 sm:border-b-0 sm:border-l sm:px-4 sm:first:border-l-0 sm:first:pl-0">
      <dt className="t-label">{totalLabels[key]}</dt>
      <dd className="t-title m-0">{number.format(c.value)}</dd>
      <dd className="t-meta m-0">
        {t('vs-previous', {
          defaultValue: '{{change}} vs previous {{days}} days',
          change: signed.format(c.change),
          days: data.range,
        })}
      </dd>
    </div>
  );

  const chartLabels = {
    showChart: t('chart-show-chart', { defaultValue: 'Show as chart' }),
    showTable: t('chart-show-table', { defaultValue: 'Show as table' }),
    day: t('chart-table-day', { defaultValue: 'Day' }),
    points: t('chart-points', { defaultValue: 'Data points' }),
    seriesSummary: (v: { label: string; first: string; last: string; min: string; max: string }) =>
      t('chart-series-summary', {
        defaultValue: '{{label}}: from {{first}} to {{last}}, lowest {{min}}, highest {{max}}.',
        ...v,
      }),
  };

  const releaseByDay = new Map<string, string[]>();
  for (const r of data.releases) releaseByDay.set(r.day, [...(releaseByDay.get(r.day) ?? []), r.version]);
  const releasedLabel = (versions: string[]) =>
    t('released', { defaultValue: '{{versions}} released', versions: versions.join(', ') });

  const viewsLabel = t('chart-views', { defaultValue: 'First views per day' });
  const likesLabel = t('chart-likes', { defaultValue: 'Likes per day' });
  const empty = data.days.every((d) => d.views + d.likes + d.comments + d.unlocks === 0);

  return (
    <div className={arrival}>
      <h2 className="t-heading mb-3">{data.title}</h2>
      <div className="mb-4">{rangeTabs}</div>

      <dl className="m-0 grid grid-cols-2 sm:flex sm:[&>div]:flex-1">
        {totalKeys.map((key) => figure(key, data.totals[key]))}
      </dl>
      <p className="t-meta mt-3">
        {data.hasViews
          ? t('views-note', {
              defaultValue:
                'First views count each signed-in viewer or device once, ever; a returning viewer is not counted again. Days are UTC.',
            })
          : t('curated-note', {
              defaultValue:
                'A curated build does not record views, so only likes, comments and unlocks are shown. Days are UTC.',
            })}
      </p>

      {empty ? (
        <p className="t-body mt-8 border-t border-site-border pt-4 text-site-text-muted">
          {t('empty', { defaultValue: 'Nothing happened on this build in the last {{days}} days.', days: data.range })}
        </p>
      ) : null}

      <section aria-labelledby="bi-chart" className="mt-8 border-t border-site-border pt-4">
        <h2 id="bi-chart" className="t-heading mb-3">
          {t('chart-title', { defaultValue: 'Day by day' })}
        </h2>
        {data.hasViews ? (
          <>
            <h3 className="t-label mb-1">{viewsLabel}</h3>
            <BarChart
              bars={data.days.map((d) => ({ label: shortDay(d.day), value: d.views }))}
              label={viewsLabel}
              summary={t('chart-views-summary', {
                defaultValue: '{{views}} first views in the last {{days}} days, as bars.',
                views: number.format(data.totals.views.value),
                days: data.range,
              })}
              columns={{ label: chartLabels.day, value: totalLabels.views }}
              format={(n) => number.format(n)}
            />
            {data.releases.length > 0 ? (
              <div aria-hidden className="mt-1 flex h-3 gap-0.5">
                {data.days.map((d) => {
                  const versions = releaseByDay.get(d.day);
                  return (
                    <div
                      key={d.day}
                      className={versions ? 'min-w-0 flex-1 border-l-2 border-site-text' : 'min-w-0 flex-1'}
                      title={versions ? `${shortDay(d.day)}: ${releasedLabel(versions)}` : undefined}
                    />
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}
        <div className="mt-6">
          <LineChart
            label={likesLabel}
            labels={chartLabels}
            formatX={shortDay}
            formatY={(n) => number.format(n)}
            series={[
              {
                id: 'likes',
                label: totalLabels.likes,
                points: data.days.map((d) => ({ x: d.day, y: d.likes })),
              },
            ]}
          />
        </div>
        {data.releases.length > 0 ? (
          <>
            <h3 className="t-label mt-6 mb-1">{t('releases-title', { defaultValue: 'Releases' })}</h3>
            <ul className="m-0 list-none p-0">
              {data.releases.map((r) => (
                <li key={`${r.day}-${r.version}`} className="t-body flex justify-between gap-4 border-b border-site-border py-2">
                  <span>{releasedLabel([r.version])}</span>
                  <span className="t-meta">{longDay(r.day)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section aria-labelledby="bi-biggest" className="mt-8 border-t border-site-border pt-4">
        <h2 id="bi-biggest" className="t-heading mb-3">
          {t('biggest-title', { defaultValue: 'Biggest days' })}
        </h2>
        {data.biggestDays.length === 0 ? (
          <p className="t-body m-0 text-site-text-muted">
            {t('biggest-empty', { defaultValue: 'No busy days in this range yet.' })}
          </p>
        ) : (
          <ol className="m-0 list-none p-0">
            {data.biggestDays.map((d) => (
              <li key={d.day} className="flex flex-col gap-0.5 border-b border-site-border py-2">
                <span className="t-body font-medium">{longDay(d.day)}</span>
                <span className="t-meta">
                  {data.hasViews
                    ? t('biggest-line', {
                        defaultValue:
                          '{{views}} first views, {{likes}} likes, {{comments}} comments, {{unlocks}} unlocks',
                        views: number.format(d.views),
                        likes: number.format(d.likes),
                        comments: number.format(d.comments),
                        unlocks: number.format(d.unlocks),
                      })
                    : t('biggest-line-curated', {
                        defaultValue: '{{likes}} likes, {{comments}} comments, {{unlocks}} unlocks',
                        likes: number.format(d.likes),
                        comments: number.format(d.comments),
                        unlocks: number.format(d.unlocks),
                      })}
                </span>
                {d.releases.length > 0 ? <span className="t-meta">{releasedLabel(d.releases)}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8 border-t border-site-border pt-4">
        <Button
          variant="ghost"
          aria-expanded={tableOpen}
          aria-controls="bi-table"
          onClick={() => setTableOpen((open) => !open)}
        >
          {tableOpen
            ? t('table-hide', { defaultValue: 'Hide table' })
            : t('table-show', { defaultValue: 'Show as table' })}
        </Button>
        {tableOpen ? (
          <div id="bi-table" className="mt-3 overflow-x-auto">
            <table className="t-body w-full border-collapse text-start">
              <caption className="sr-only">
                {t('table-caption', { defaultValue: 'Daily counts for this build' })}
              </caption>
              <thead>
                <tr className="border-b border-site-border">
                  <th scope="col" className="t-label py-2 pe-3 text-start">
                    {chartLabels.day}
                  </th>
                  {totalKeys.map((key) => (
                    <th key={key} scope="col" className="t-label py-2 pe-3 text-end">
                      {totalLabels[key]}
                    </th>
                  ))}
                  <th scope="col" className="t-label py-2 text-start">
                    {t('table-release', { defaultValue: 'Release' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => {
                  const versions = releaseByDay.get(d.day);
                  return (
                    <tr key={d.day} className="border-b border-site-border">
                      <th scope="row" className="py-2 pe-3 text-start font-normal">
                        {longDay(d.day)}
                      </th>
                      {totalKeys.map((key) => (
                        <td key={key} className="py-2 pe-3 text-end">
                          {number.format(d[key])}
                        </td>
                      ))}
                      <td className="py-2">{versions ? releasedLabel(versions) : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

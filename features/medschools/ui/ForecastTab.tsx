import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { CHARTED_TYPES, formatUtcDay } from '../engine/public-read';
import { cycleLabelIsolated } from '../engine/cycle';
import { forecastQuery } from '../medschools.queries';
import type { MedChartedTypeId, MedSchoolDetailDto } from '../medschools.contract';
import { ForecastBand } from './charts/ForecastBand';
import { useChartLabels } from './chartLabels';
import { useMedLabels } from './labels';
import { OptionGroup } from './OptionGroup';
import type { SchoolSearch, SetSchoolSearch } from './school-search';
import { SchoolChances } from './SchoolChances';
import { ChartSkeleton, SkeletonSwap } from './skeletons';

/**
 * Forecast: where this cycle's running total of one category is likely to end, from earlier cycles of the same source,
 * with the observed line up to the day the model saw. "All programs" is not a forecast of its own (never summed): it
 * shows the school's regular program and says so (D12). The forecast is computed once a day, so every figure carries
 * its date ("Forecast as of ...").
 */
export function ForecastTab({
  slug,
  detail,
  search,
  setSearch,
  programControl,
}: {
  slug: string;
  detail: MedSchoolDetailDto;
  search: SchoolSearch;
  setSearch: SetSchoolSearch;
  /** The school page's program toggles, beside the category group. */
  programControl: ReactNode;
}) {
  const { t } = useTranslation('medschools');
  const { eventLabel, sourceName, programFilterLabel } = useMedLabels();
  const chartLabels = useChartLabels();
  const { locale } = useLocaleFormat();
  // The band is a model output: whole events (the stored quantiles carry a fraction).
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  // WITHDRAWN and HOLD are never charted: they read as Interview here (the loader prefetches the same key).
  const type: MedChartedTypeId = CHARTED_TYPES.includes(search.type) ? (search.type as MedChartedTypeId) : 'INTERVIEW';
  const program = search.program === 'PHD' ? 'PHD' : 'REG';
  const query = useQuery(forecastQuery(slug, { program, type }));
  const data = query.data;

  const controls = (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {programControl}
      <OptionGroup
        label={t('school-type-label', { defaultValue: 'Category' })}
        value={type}
        options={CHARTED_TYPES.map((ty) => ({
          value: ty as MedChartedTypeId,
          label: eventLabel(ty as MedChartedTypeId),
        }))}
        onChange={(next) => setSearch({ type: next })}
      />
    </div>
  );

  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {controls}
        <EmptyState
          title={t('forecast-load-failed', { defaultValue: 'Could not load the forecast.' })}
          action={<Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
        />
      </div>
    );
  }

  const date = (d: string) => formatUtcDay(d, locale);
  const drawn = data && data.status !== 'no-data';
  const basisSources = data ? [...new Set(data.basis.map((b) => sourceName(b.source)))].join(', ') : '';
  const basisLine = !data
    ? null
    : data.basis.length === 1
      ? t('forecast-basis-one', {
          defaultValue: 'Based on one earlier cycle from {{source}}.',
          source: basisSources,
        })
      : data.basis.length > 1
        ? t('forecast-basis', {
            defaultValue: 'Based on {{n}} earlier cycles from {{source}}.',
            n: nf.format(data.basis.length),
            source: basisSources,
          })
        : null;

  return (
    <div className="flex flex-col gap-6">
      {controls}
      <SkeletonSwap ready={!!data} skeleton={<ChartSkeleton />}>
        {data ? (
          <div className="flex flex-col gap-4">
            <h2 className="t-heading m-0">
              {t('forecast-heading', {
                defaultValue: '{{cycle}} cycle',
                cycle: cycleLabelIsolated(data.cycleYear),
              })}
            </h2>
            {search.program === 'ALL' ? (
              <p className="t-meta m-0">
                {t('forecast-program-note', {
                  defaultValue: 'A forecast is made for one program at a time. Showing {{program}}.',
                  program: programFilterLabel(program, detail.school.degree),
                })}
              </p>
            ) : null}
            {drawn ? (
              <ForecastBand
                eventType={type}
                sourceName={data.source ? sourceName(data.source) : ''}
                dayZeroOn={data.dayZeroOn}
                observed={data.observed}
                band={data.band}
                labels={chartLabels(
                  t('forecast-title', { defaultValue: '{{type}}, forecast', type: eventLabel(type) }),
                )}
                legendLabels={{
                  observed: t('forecast-legend-observed', { defaultValue: 'Reported so far' }),
                  median: t('forecast-legend-median', { defaultValue: 'Median forecast' }),
                  range: t('forecast-legend-range', { defaultValue: '10th to 90th percentile' }),
                  low: t('forecast-legend-low', { defaultValue: '10th percentile' }),
                  high: t('forecast-legend-high', { defaultValue: '90th percentile' }),
                }}
              />
            ) : (
              <EmptyState title={t('forecast-empty-no-data', { defaultValue: 'No reported events yet this cycle.' })} />
            )}

            {data.status === 'no-history' ? (
              <p className="t-meta m-0">
                {t('forecast-empty-no-history', {
                  defaultValue: 'Earlier cycles do not have enough reported events for a forecast.',
                })}
              </p>
            ) : null}
            {data.status === 'pending' ? (
              <p className="t-meta m-0">
                {t('forecast-empty-pending', { defaultValue: 'The forecast is computed once a day.' })}
              </p>
            ) : null}

            {data.summary ? (
              <ul className="m-0 list-none border-t border-site-border p-0">
                <li className="t-body border-b border-site-border py-2">
                  {t('forecast-total', {
                    defaultValue: '{{type}}: expected total {{p50}}, likely between {{p10}} and {{p90}}',
                    p50: nf.format(data.summary.total.p50),
                    p10: nf.format(data.summary.total.p10),
                    p90: nf.format(data.summary.total.p90),
                    type: eventLabel(type),
                  })}
                </li>
                <li className="t-body border-b border-site-border py-2">
                  {t('forecast-half', {
                    defaultValue: 'Half of them by {{date}}, likely between {{from}} and {{to}}',
                    date: date(data.summary.halfOn.p50),
                    from: date(data.summary.halfOn.p10),
                    to: date(data.summary.halfOn.p90),
                  })}
                </li>
              </ul>
            ) : null}

            <div className="flex flex-col gap-1">
              {data.asOf && (data.status === 'ready' || data.status === 'early') ? (
                <p className="t-meta m-0">
                  {t('forecast-asof', { defaultValue: 'Forecast as of {{date}}.', date: date(data.asOf) })}
                </p>
              ) : null}
              {basisLine ? <p className="t-meta m-0">{basisLine}</p> : null}
              {data.basis.length === 1 ? (
                <p className="t-meta m-0">
                  {t('forecast-basis-narrow', {
                    defaultValue: 'With one earlier cycle the range is narrower than the real uncertainty.',
                  })}
                </p>
              ) : null}
              {data.status === 'early' ? (
                <p className="t-meta m-0">
                  {t('forecast-early', {
                    defaultValue: 'Early in the cycle, so the range is wide and rests on the totals of earlier cycles.',
                  })}
                </p>
              ) : null}
              {data.dayZeroEstimated ? (
                <p className="t-meta m-0">
                  {t('school-day-zero-estimated', {
                    defaultValue: 'Cycle start estimated as {{date}}.',
                    date: formatUtcDay(data.dayZeroOn, locale),
                  })}
                </p>
              ) : null}
            </div>
            <SchoolChances slug={slug} cycle={data.cycleYear} />
          </div>
        ) : null}
      </SkeletonSwap>
    </div>
  );
}

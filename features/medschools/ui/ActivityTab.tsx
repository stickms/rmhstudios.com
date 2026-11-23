import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { CHARTED_TYPES, SHORT_SOURCE_NAMES, formatUtcDay, toCumulativeByDay } from '../engine/public-read';
import { cycleEndOn, cycleLabel } from '../engine/cycle';
import { buildTotalsMatrix } from '../engine/totals';
import { activityQuery } from '../medschools.queries';
import type { MedChartedTypeId, MedSchoolDetailDto, MedSourceId } from '../medschools.contract';
import { CategoryToggles } from './CategoryToggles';
import { CategoryLines } from './charts/CategoryLines';
import { CumulativeLine } from './charts/CumulativeLine';
import { DailyBars } from './charts/DailyBars';
import { useChartLabels } from './chartLabels';
import { useMedLabels } from './labels';
import type { SchoolSearch, SetSchoolSearch } from './school-search';
import { ChartSkeleton, SkeletonSwap } from './skeletons';
import { SourceLinks } from './SourceLinks';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Activity: the toggleable category lines first (O4), then one type's daily bars and cumulative line, then totals. */
export function ActivityTab({
  slug,
  detail,
  search,
  setSearch,
}: {
  slug: string;
  detail: MedSchoolDetailDto;
  search: SchoolSearch;
  setSearch: SetSchoolSearch;
}) {
  const { t } = useTranslation('medschools');
  const { eventLabel, eventShortLabel, sourceName } = useMedLabels();
  const chartLabels = useChartLabels();
  const { locale } = useLocaleFormat();
  const nf = new Intl.NumberFormat(locale);
  const query = useQuery(activityQuery(slug, { program: search.program, cycle: search.cycle }));
  // Fixed per mount: the server and the first client render must agree on the last day drawn.
  const [today] = useState(todayUtc);

  if (query.isError) {
    return (
      <EmptyState
        title={t('school-activity-failed', { defaultValue: 'Could not load the activity.' })}
        action={<Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
      />
    );
  }

  const data = query.data;
  const types = data?.types ?? [];
  const matrix = buildTotalsMatrix(types, data?.otherTotals);
  const visible = search.show.filter((s): s is MedChartedTypeId => CHARTED_TYPES.includes(s));
  // The charts run from day zero to today, or to the cycle's last day once it is over: never 500 days of nothing.
  const chartEnd = data ? [today, cycleEndOn(data.cycleYear)].sort()[0]! : today;
  const to = data && chartEnd > data.dayZeroOn ? chartEnd : (data?.dayZeroOn ?? today);
  const hasAny = types.some((ty) => ty.sources.length > 0);
  const chosen = types.find((ty) => ty.eventType === search.type);
  const chosenPrimary = chosen?.sources.find((s) => s.source === chosen.primary) ?? chosen?.sources[0];
  const chosenComparison = chosen?.sources.filter((s) => s !== chosenPrimary) ?? [];

  return (
    <SkeletonSwap
      ready={!!data}
      skeleton={
        <div className="flex flex-col gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      }
    >
      {data && !hasAny ? (
        <EmptyState title={t('school-activity-empty', { defaultValue: 'No reported events yet this cycle.' })} />
      ) : data ? (
        <div className="flex flex-col gap-8">
          <h2 className="t-heading m-0">
            {t('school-activity-heading', {
              defaultValue: '{{cycle}} cycle',
              cycle: cycleLabel(data.cycleYear),
            })}
          </h2>
          <section
            className="flex flex-col gap-3"
            aria-label={t('school-categories-section', { defaultValue: 'Categories' })}
          >
            <CategoryToggles value={search.show} onChange={(show) => setSearch({ show })} />
            <CategoryLines
              labels={chartLabels(
                t('school-categories-title', { defaultValue: 'Cumulative reported events by category' }),
              )}
              visible={visible}
              dayZeroOn={data.dayZeroOn}
              sources={[
                ...new Set(
                  types
                    .filter((ty) => visible.includes(ty.eventType))
                    .map((ty) => ty.primary)
                    .filter((s): s is MedSourceId => s !== null),
                ),
              ]}
              series={types.flatMap((ty) => {
                const src = ty.sources.find((s) => s.source === ty.primary);
                return src
                  ? [
                      {
                        eventType: ty.eventType,
                        label: eventLabel(ty.eventType),
                        shortLabel: eventShortLabel(ty.eventType),
                        points: toCumulativeByDay(src.days, data.dayZeroOn),
                      },
                    ]
                  : [];
              })}
            />
          </section>

          <section
            className="flex flex-col gap-3"
            aria-label={t('school-type-section', { defaultValue: 'One category by day' })}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-label">{t('school-type-visible-label', { defaultValue: 'Category' })}</span>
              <Select
                controlSize="sm"
                aria-label={t('school-type-label', { defaultValue: 'Category' })}
                value={search.type}
                onChange={(e) => setSearch({ type: e.target.value as MedChartedTypeId })}
              >
                {CHARTED_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {eventLabel(ty as MedChartedTypeId)}
                  </option>
                ))}
              </Select>
            </div>
            {chosenPrimary ? (
              <>
                <DailyBars
                  primary={chosenPrimary}
                  from={data.dayZeroOn}
                  to={to}
                  labels={chartLabels(
                    t('school-daily-title', {
                      defaultValue: '{{type}} by day',
                      type: eventLabel(search.type),
                    }),
                  )}
                />
                <CumulativeLine
                  primary={chosenPrimary}
                  comparison={chosenComparison}
                  dayZeroOn={data.dayZeroOn}
                  to={to}
                  labels={chartLabels(
                    t('school-cumulative-title', {
                      defaultValue: '{{type}}, cumulative',
                      type: eventLabel(search.type),
                    }),
                  )}
                />
              </>
            ) : (
              <p className="t-meta m-0">
                {t('school-type-empty', {
                  defaultValue: 'No reported {{type}} events yet this cycle.',
                  type: eventLabel(search.type).toLowerCase(),
                })}
              </p>
            )}
            {data.dayZeroEstimated ? (
              <p className="t-meta m-0">
                {t('school-day-zero-estimated', {
                  defaultValue: 'Cycle start estimated as {{date}}.',
                  date: formatUtcDay(data.dayZeroOn, locale),
                })}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="medschools-totals">
            <h2 id="medschools-totals" className="t-heading m-0">
              {t('school-totals-title', { defaultValue: 'Totals this cycle' })}
            </h2>
            {matrix.rows.length > 0 ? (
              <>
                <table className="t-body mt-2 w-full border-collapse">
                  <thead>
                    <tr>
                      <th scope="col" className="t-meta border-b border-site-border py-2 pe-3 text-start font-normal">
                        {t('school-totals-category', { defaultValue: 'Category' })}
                      </th>
                      {matrix.sources.map((src) => (
                        <th
                          key={src}
                          scope="col"
                          className="t-meta border-b border-site-border py-2 ps-3 text-end font-normal"
                        >
                          {SHORT_SOURCE_NAMES[src]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.eventType}>
                        <th scope="row" className="border-b border-site-border py-2 pe-3 text-start font-normal">
                          {eventLabel(row.eventType)}
                        </th>
                        {row.cells.map((cell, i) => (
                          <td
                            key={matrix.sources[i]}
                            className={`border-b border-site-border py-2 ps-3 text-end tabular-nums ${cell?.primary ? 'font-semibold' : 'text-site-text-muted'}`}
                          >
                            {cell ? (
                              <>
                                {nf.format(cell.total)}
                                {cell.primary ? (
                                  <span className="sr-only">
                                    {' '}
                                    {t('school-totals-primary', { defaultValue: '(primary)' })}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <>
                                <span aria-hidden="true">&ndash;</span>
                                <span className="sr-only">
                                  {t('school-totals-none', { defaultValue: 'No figure' })}
                                </span>
                              </>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="t-meta mt-2 mb-0">
                  {t('school-totals-note', {
                    defaultValue:
                      'Reported events this cycle. Bold marks the primary source, the one the daily chart draws.',
                  })}
                </p>
              </>
            ) : null}
          </section>

          {data.unreportedProgram > 0 && data.unreportedProgramSource ? (
            <p className="t-meta m-0">
              {t('school-unreported-program', {
                count: data.unreportedProgram,
                defaultValue_one:
                  '{{count}} reported event from {{source}} did not say a program and is in none of these figures.',
                defaultValue_other:
                  '{{count}} reported events from {{source}} did not say a program and are in none of these figures.',
                defaultValue:
                  '{{count}} reported events from {{source}} did not say a program and are in none of these figures.',
                source: sourceName(data.unreportedProgramSource),
              })}
            </p>
          ) : null}
          <SourceLinks links={detail.links} cycleYear={data.cycleYear} />
        </div>
      ) : null}
    </SkeletonSwap>
  );
}

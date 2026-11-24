import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CHARTED_TYPES, SHORT_SOURCE_NAMES, formatUtcDay, toCumulativeByDay } from '../engine/public-read';
import { cycleEndOn, cycleLabelIsolated } from '../engine/cycle';
import { buildTotalsMatrix } from '../engine/totals';
import { activityQuery } from '../medschools.queries';
import type { MedChartedTypeId, MedSchoolDetailDto, MedSourceId } from '../medschools.contract';
import { CATEGORY_ORDER, CategoryToggles } from './CategoryToggles';
import { CategoryLines } from './charts/CategoryLines';
import { CATEGORY_COLOR } from './charts/chartColors';
import { CumulativeLine } from './charts/CumulativeLine';
import { DailyBars } from './charts/DailyBars';
import { useChartLabels } from './chartLabels';
import { useMedLabels } from './labels';
import { MedEmpty } from './MedEmpty';
import { OptionGroup } from './OptionGroup';
import type { SchoolSearch, SetSchoolSearch } from './school-search';
import { ChartSkeleton, SkeletonSwap } from './skeletons';
import { SourceLinks } from './SourceLinks';
import { StatusIcon } from './status/StatusIcon';
import { StatusText } from './status/StatusText';
import { statusOfEvent } from './status/status';
import { WaveNote } from './WaveNote';
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
  const { eventLabel, sourceName } = useMedLabels();
  const chartLabels = useChartLabels();
  const { locale } = useLocaleFormat();
  const nf = new Intl.NumberFormat(locale);
  const query = useQuery(activityQuery(slug, { program: search.program, cycle: search.cycle }));
  // Fixed per mount: the server and the first client render must agree on the last day drawn.
  const [today] = useState(todayUtc);

  if (query.isError) {
    return (
      <MedEmpty
        title={t('school-activity-failed', { defaultValue: 'Could not load the activity.' })}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  const types = data?.types ?? [];
  const matrix = buildTotalsMatrix(types, data?.otherTotals);
  const visible = search.show.filter((s): s is MedChartedTypeId => CHARTED_TYPES.includes(s));
  // The charts run from day zero to today, or to the cycle's last day once it is over (the last category's: decisions
  // run to August 31): never 500 days of nothing.
  const chartEnd = data ? [today, cycleEndOn(data.cycleYear, 'ACCEPTANCE')].sort()[0]! : today;
  const to = data && chartEnd > data.dayZeroOn ? chartEnd : (data?.dayZeroOn ?? today);
  const hasAny = types.some((ty) => ty.sources.length > 0);
  const chosen = types.find((ty) => ty.eventType === search.type);
  const chosenPrimary = chosen?.sources.find((s) => s.source === chosen.primary) ?? chosen?.sources[0];
  const chosenComparison = chosen?.sources.filter((s) => s !== chosenPrimary) ?? [];
  // The "by day" chart stacks every category the URL names (all of them when it names none), each from its primary.
  const daily: MedChartedTypeId[] = search.daily?.length
    ? CATEGORY_ORDER.filter((c) => search.daily!.includes(c))
    : [...CATEGORY_ORDER];
  const dailySeries = daily.flatMap((type) => {
    const ty = types.find((x) => x.eventType === type);
    const primary = ty?.sources.find((s) => s.source === ty.primary) ?? ty?.sources[0];
    return primary ? [{ key: type, name: eventLabel(type), color: CATEGORY_COLOR[type], primary }] : [];
  });

  return (
    <SkeletonSwap
      ready={!!data}
      stale={query.isPlaceholderData}
      skeleton={
        <div className="medapp-tab">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      }
    >
      {data && !hasAny ? (
        <MedEmpty title={t('school-activity-empty', { defaultValue: 'No reported events yet this cycle.' })} />
      ) : data ? (
        <div className="medapp-tab">
          <h2 className="medapp-h2">
            {t('school-activity-heading', {
              defaultValue: '{{cycle}} cycle',
              cycle: cycleLabelIsolated(data.cycleYear),
            })}
          </h2>
          <section
            className="medapp-section"
            aria-label={t('school-categories-section', { defaultValue: 'Categories' })}
          >
            <CategoryLines
              legend={<CategoryToggles value={search.show} onChange={(show) => setSearch({ show })} />}
              labels={chartLabels(
                t('school-categories-title', { defaultValue: 'Cumulative reported events by category' }),
              )}
              visible={visible}
              waves={data.waves}
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
                        points: toCumulativeByDay(src.days, data.dayZeroOn),
                      },
                    ]
                  : [];
              })}
            />
          </section>

          <WaveNote waves={data.waves} />

          <section className="medapp-section" aria-label={t('school-daily-section', { defaultValue: 'By day' })}>
            <DailyBars
              legend={
                <CategoryToggles
                  value={daily}
                  onChange={(next) => setSearch({ daily: next })}
                  bars
                  label={t('category-toggles-daily-label', { defaultValue: 'Show categories by day' })}
                />
              }
              series={dailySeries}
              from={data.dayZeroOn}
              to={to}
              waves={daily.includes('INTERVIEW') ? data.waves : undefined}
              labels={chartLabels(
                daily.length === 1
                  ? t('school-daily-title', { defaultValue: '{{type}} by day', type: eventLabel(daily[0]!) })
                  : t('school-daily-title-many', { defaultValue: 'Reported events by day' }),
              )}
            />
          </section>

          <section
            className="medapp-section"
            aria-label={t('school-type-section', { defaultValue: 'One category by day' })}
          >
            <div className="medapp-controls">
              <span className="medapp-label">{t('school-type-visible-label', { defaultValue: 'Category' })}</span>
              <OptionGroup
                label={t('school-type-label', { defaultValue: 'Category' })}
                value={search.type as MedChartedTypeId}
                options={CHARTED_TYPES.map((ty) => ({
                  value: ty as MedChartedTypeId,
                  label: eventLabel(ty as MedChartedTypeId),
                }))}
                onChange={(type) => setSearch({ type })}
              />
            </div>
            {chosenPrimary ? (
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
            ) : (
              <p className="medapp-meta">
                {t('school-type-empty', {
                  defaultValue: 'No reported {{type}} events yet this cycle.',
                  type: eventLabel(search.type).toLowerCase(),
                })}
              </p>
            )}
            {data.dayZeroEstimated ? (
              <p className="medapp-meta">
                {t('school-day-zero-estimated', {
                  defaultValue: 'Cycle start estimated as {{date}}.',
                  date: formatUtcDay(data.dayZeroOn, locale),
                })}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="medschools-totals" className="medapp-section medapp-section--panel">
            <h2 id="medschools-totals" className="medapp-h2">
              {t('school-totals-title', { defaultValue: 'Totals this cycle' })}
            </h2>
            {matrix.rows.length > 0 ? (
              <>
                <table className="medapp-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('school-totals-category', { defaultValue: 'Category' })}</th>
                      {matrix.sources.map((src) => (
                        <th key={src} scope="col" className="is-num">
                          {SHORT_SOURCE_NAMES[src]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.eventType}>
                        <th scope="row">
                          <span className="medapp-category-row">
                            <StatusIcon status={statusOfEvent(row.eventType)} size="sm" />
                            <StatusText status={statusOfEvent(row.eventType)}>{eventLabel(row.eventType)}</StatusText>
                          </span>
                        </th>
                        {row.cells.map((cell, i) => (
                          <td key={matrix.sources[i]} className={`is-num ${cell?.primary ? 'is-primary' : 'is-muted'}`}>
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
                <p className="medapp-meta">
                  {t('school-totals-note', {
                    defaultValue:
                      'Reported events this cycle. Bold marks the primary source, the one the daily chart draws.',
                  })}
                </p>
              </>
            ) : null}
          </section>

          {data.unreportedProgram > 0 && data.unreportedProgramSource ? (
            <p className="medapp-meta">
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

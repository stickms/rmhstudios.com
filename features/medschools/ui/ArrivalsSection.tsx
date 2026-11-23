import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { enoughArrivals } from '../engine/arrivals';
import { cycleLabel } from '../engine/cycle';
import { formatUtcDay } from '../engine/public-read';
import type { MedChartedTypeId, MedProgramFilter } from '../medschools.contract';
import { arrivalsQuery } from '../medschools.queries';
import { ArrivalBars, type ArrivalItem } from './charts/ArrivalBars';
import { CATEGORY_COLOR } from './charts/chartColors';
import { useChartLabels } from './chartLabels';
import { useMedLabels } from './labels';

/** Monday-first 2024 dates, so `Intl` names the weekdays and hours in the viewer's language. */
const WEEKDAY_DATES = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i, 12)));

/**
 * "When results arrive" (owner 2026-11-23), under the History overlay: reports of the chosen category by weekday and by
 * hour of day, both in US Eastern (named in the caption), then the typical dates by past cycle as rows. Hidden when
 * fewer than ten events have an exact time (day-only SDN dates are not counted; the server decides). Aggregates only.
 */
export function ArrivalsSection({
  slug,
  type,
  program,
}: {
  slug: string;
  type: MedChartedTypeId;
  program: MedProgramFilter;
}) {
  const { t } = useTranslation('medschools');
  const { eventLabel } = useMedLabels();
  const chartLabels = useChartLabels();
  const query = useQuery(arrivalsQuery(slug, { program, type }));
  const data = query.data;
  if (!data || !enoughArrivals(data.total)) return null;

  const locale = chartLabels('').locale;
  const wd = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const wdShort = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  const hourFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' });
  const weekdayItems: ArrivalItem[] = data.weekdays.map((count, i) => ({
    key: `d${i}`,
    label: wd.format(WEEKDAY_DATES[i]),
    tick: wdShort.format(WEEKDAY_DATES[i]),
    count,
  }));
  const hourItems: ArrivalItem[] = data.hours.map((count, h) => {
    const label = hourFmt.format(new Date(Date.UTC(2024, 0, 1, h)));
    return { key: `h${h}`, label, tick: h % 3 === 0 ? label : null, count };
  });
  const color = CATEGORY_COLOR[type];
  const category = eventLabel(type);
  const zone = t('arrivals-zone', { defaultValue: 'US Eastern time' });
  const day = (d: string) => formatUtcDay(d, locale, { month: 'short', day: 'numeric' });
  const sources = t('arrivals-sources', { defaultValue: 'Sources: Admit.org, Student Doctor Network' });

  return (
    <section aria-labelledby="medschools-arrivals-heading" className="flex flex-col gap-4">
      <h2 id="medschools-arrivals-heading" className="t-heading m-0">
        {t('arrivals-heading', { defaultValue: 'When results arrive' })}
      </h2>
      <ArrivalBars
        items={weekdayItems}
        color={color}
        title={t('arrivals-weekday-title', { defaultValue: '{{type}} by day of the week', type: category })}
        unit={t('arrivals-unit', { defaultValue: 'Reported events, {{zone}}', zone })}
        sourcesLine={sources}
        head={[t('arrivals-weekday', { defaultValue: 'Day' }), t('chart-count', { defaultValue: 'Reported events' })]}
        labels={chartLabels('')}
      />
      <ArrivalBars
        items={hourItems}
        color={color}
        title={t('arrivals-hour-title', { defaultValue: '{{type}} by hour of the day', type: category })}
        unit={t('arrivals-unit', { defaultValue: 'Reported events, {{zone}}', zone })}
        sourcesLine={sources}
        head={[t('arrivals-hour', { defaultValue: 'Hour' }), t('chart-count', { defaultValue: 'Reported events' })]}
        labels={chartLabels('')}
      />
      {data.cycles.length > 0 ? (
        <div>
          <h3 className="t-label m-0">
            {t('arrivals-typical', { defaultValue: 'Typical dates by cycle ({{zone}})', zone })}
          </h3>
          <ul className="m-0 list-none p-0">
            {data.cycles.map((c) => (
              <li
                key={c.cycleYear}
                className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-site-border py-2"
              >
                <span className="t-body">{cycleLabel(c.cycleYear)}</span>
                <span className="t-meta">
                  {t('arrivals-cycle-row', {
                    defaultValue: 'First report {{first}} · Half reported by {{median}} · {{n}} reports',
                    first: day(c.firstOn),
                    median: day(c.medianOn),
                    n: new Intl.NumberFormat(locale).format(c.count),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

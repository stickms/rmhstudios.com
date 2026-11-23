import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import type { ChartLabels } from './charts/ChartFrame';

/** Every word the charts print, translated once; each chart passes its own title. */
export function useChartLabels(): (title: string) => ChartLabels {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const nf = new Intl.NumberFormat(locale);
  return (title) => ({
    title,
    unit: t('chart-unit', { defaultValue: 'Reported events' }),
    unitDaily: t('chart-unit-daily', { defaultValue: 'Reported events per day' }),
    unitCumulative: t('chart-unit-cumulative', { defaultValue: 'Reported events, running total' }),
    sourcesLine: ({ primary, comparison }) =>
      comparison.length > 0
        ? t('chart-sources-with-others', {
            defaultValue: 'Sources: {{primary}} (primary), {{others}}',
            primary,
            others: comparison.join(', '),
          })
        : t('chart-sources', { defaultValue: 'Sources: {{primary}} (primary)', primary }),
    sourcesPlain: (names) => t('chart-sources-plain', { defaultValue: 'Sources: {{names}}', names: names.join(', ') }),
    primary: t('chart-primary', { defaultValue: 'Primary' }),
    comparison: t('chart-comparison', { defaultValue: 'Comparison' }),
    date: t('chart-date', { defaultValue: 'Date' }),
    count: t('chart-count', { defaultValue: 'Reported events' }),
    cumulative: t('chart-cumulative', { defaultValue: 'cumulative' }),
    empty: t('chart-empty', { defaultValue: 'No reported events yet' }),
    showData: t('chart-show-data', { defaultValue: 'Show data' }),
    hint: t('chart-hint', {
      defaultValue: 'Use the left and right arrow keys to read the values by date.',
    }),
    summary: ({ lines }) =>
      t('chart-summary', {
        defaultValue: 'Chart of reported events: {{lines}}',
        lines: lines.map((l) => `${l.name} ${nf.format(l.total)}`).join('; '),
      }),
    wave: {
      legend: t('wave-legend', { defaultValue: 'Wave' }),
      probe: (count) =>
        t('wave-probe', {
          count,
          defaultValue_one: 'Wave: {{n}} invite',
          defaultValue_other: 'Wave: {{n}} invites',
          defaultValue: 'Wave: {{n}} invites',
          n: nf.format(count),
        }),
    },
    locale,
  });
}

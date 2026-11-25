/**
 * The line on a results screen that says the run was played on a picked chart.
 *
 * A run on a chart other than the song's generated one is recorded and earns its usual career totals, but it never
 * writes the song's board (the board has no chart dimension). The author's own draft is a playtest: not submitted.
 */

import { useTranslation } from 'react-i18next';
import { useSliceItStore } from '@features/slice-it/engine/store';

export function ChartRunNote() {
  const { t } = useTranslation('chart-misses');
  const chart = useSliceItStore((state) => state.playingChart);
  if (!chart) return null;

  return (
    <div className="slice-label mt-3" role="note">
      {chart.status === 'draft'
        ? t('played-draft', {
            defaultValue: 'Played on {{chart}} (a draft) — not submitted',
            chart: chart.name,
          })
        : t('played-on-chart', {
            defaultValue: "Played on {{chart}} — not on the song's board",
            chart: chart.name,
          })}
    </div>
  );
}

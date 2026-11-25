/**
 * The selected note's miss rate, from the sampled runs on the chart's current version (author only).
 *
 * Says nothing until the chart has enough sampled runs to show a heat row, and nothing for a note the saved chart does
 * not have yet (an unsaved edit moves notes away from the times the runs were counted on).
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MIN_SAMPLED_RUNS, noteMsOf, ratePercent } from '@features/slice-it/engine/miss-times';
import { useChartMisses } from './useChartMisses';

export function NoteMissRate({ time }: { time: number }) {
  const { t } = useTranslation('chart-misses');
  const misses = useChartMisses();
  const data = misses.data;

  const byMs = useMemo(() => new Map((data?.notes ?? []).map((note) => [note.noteMs, note.rate])), [data]);
  if (!data || data.sampledRuns < MIN_SAMPLED_RUNS) return null;

  const rate = byMs.get(noteMsOf(time));
  return (
    <p className="mt-3 text-xs text-slice-text-muted">
      {rate === undefined
        ? t('note-no-data', { defaultValue: 'No miss data for this note yet' })
        : t('note-miss-rate', {
            percent: ratePercent(rate),
            runs: data.sampledRuns,
            defaultValue: 'Missed in {{percent}}% of {{runs}} sampled runs',
          })}
    </p>
  );
}

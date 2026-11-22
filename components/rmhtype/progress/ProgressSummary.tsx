/** The headline figures for the chosen range: runs, median, change, best run, consistency. */
import { useTranslation } from 'react-i18next';
import type { ProgressSummary as Summary } from '@/lib/rmhtype/progress';
import { useProgressLabels } from '@/components/rmhtype/progress/progress-labels';

export function ProgressSummary({ summary, hasPrevious }: { summary: Summary; hasPrevious: boolean }) {
  const { t } = useTranslation('rmhtype-progress');
  const f = useProgressLabels();
  const none = t('value-none', {
    defaultValue: 'None yet',
  });
  const stats: {
    id: string;
    label: string;
    value: string;
    note?: string;
  }[] = [
    {
      id: 'runs',
      label: t('stat-runs', {
        defaultValue: 'Runs',
      }),
      value: f.number(summary.runs),
    },
    {
      id: 'median',
      label: t('stat-median', {
        defaultValue: 'Median speed',
      }),
      value: summary.medianWpm === null ? none : f.wpm(summary.medianWpm),
    },
    {
      id: 'change',
      label: t('stat-change', {
        defaultValue: 'Change',
      }),
      value: summary.changeWpm === null ? '-' : f.signedWpm(summary.changeWpm),
      note: !hasPrevious
        ? t('stat-change-all', {
            defaultValue: 'Nothing to compare with',
          })
        : summary.changeWpm === null
          ? t('stat-change-none', {
              defaultValue: 'No runs in the range before',
            })
          : t('stat-change-note', {
              defaultValue: 'Against the range before',
            }),
    },
    {
      id: 'best',
      label: t('stat-best', {
        defaultValue: 'Best run',
      }),
      value: summary.best ? f.wpm(summary.best.wpm) : none,
      ...(summary.best
        ? {
            note: t('stat-best-note', {
              defaultValue: '{{accuracy}} accuracy, {{date}}',
              accuracy: f.accuracy(summary.best.accuracy),
              date: f.date(summary.best.at),
            }),
          }
        : {}),
    },
    {
      id: 'consistency',
      label: t('stat-consistency', {
        defaultValue: 'Consistency',
      }),
      value: summary.consistency === null ? '-' : f.wpm(summary.consistency),
      note:
        summary.consistency === null
          ? t('stat-consistency-none', {
              defaultValue: 'Needs four runs',
            })
          : t('stat-consistency-note', {
              defaultValue: 'Spread of the middle half of runs',
            }),
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-app-border pt-4 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div key={s.id}>
          <dt className="text-sm text-app-text-muted">{s.label}</dt>
          <dd className="mt-0.5 font-mono text-xl font-semibold">{s.value}</dd>
          {s.note ? <dd className="mt-0.5 text-xs text-app-text-muted">{s.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Personal bests by passage length and difficulty; each date opens the run list at that run. */
import { useTranslation } from 'react-i18next';
import type { BestRun } from '@/lib/rmhtype/progress';
import { useProgressLabels } from '@/components/rmhtype/progress/progress-labels';

export function ProgressBests({ bests, onOpenRun }: { bests: BestRun[]; onOpenRun: (cursor: string) => void }) {
  const { t } = useTranslation('rmhtype-progress');
  const f = useProgressLabels();
  if (bests.length === 0) {
    return (
      <p className="text-sm text-app-text-muted">
        {t('bests-empty', {
          defaultValue: 'Your personal bests appear here after your first run.',
        })}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {t('bests-title', {
            defaultValue: 'Personal bests',
          })}
        </caption>
        <thead>
          <tr className="border-b border-app-border text-left text-app-text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('col-length', {
                defaultValue: 'Length',
              })}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('col-difficulty', {
                defaultValue: 'Difficulty',
              })}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t('col-speed', {
                defaultValue: 'Speed',
              })}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t('col-accuracy', {
                defaultValue: 'Accuracy',
              })}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('col-date', {
                defaultValue: 'Date',
              })}
            </th>
          </tr>
        </thead>
        <tbody>
          {bests.map((b) => (
            <tr key={`${b.passageLength}|${b.difficulty}`} className="border-b border-app-border">
              <td className="py-2 pr-3">{f.length(b.passageLength)}</td>
              <td className="py-2 pr-3">{f.difficulty(b.difficulty)}</td>
              <td className="py-2 pr-3 text-right font-mono">{f.wpm(b.wpm)}</td>
              <td className="py-2 pr-3 text-right font-mono">{f.accuracy(b.accuracy)}</td>
              <td className="py-2">
                <button
                  type="button"
                  onClick={() => onOpenRun(b.cursor)}
                  className="underline hover:text-app-accent"
                  title={t('bests-open-run', {
                    defaultValue: 'Show this run in your recent runs',
                  })}
                >
                  {f.date(b.at)}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

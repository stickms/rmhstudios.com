import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { send, useInsight } from './api';

interface Cohorts {
  cohorts: { cohortWeek: string; size: number; weeks: Record<string, number> }[];
  computedAt: string | null;
}

const WEEKS = Array.from({ length: 13 }, (_, i) => i);

export function CohortsTab() {
  const { t } = useTranslation('f-ops');
  const { data, loading, reload } = useInsight<Cohorts>('/api/admin/insights/cohorts');
  const [busy, setBusy] = useState(false);

  const recompute = async () => {
    setBusy(true);
    const r = await send('/api/admin/insights/cohorts', 'POST');
    setBusy(false);
    if (!r.ok)
      return void toast.error(
        t('cohorts-recompute-failed', { defaultValue: 'Could not recompute.' }),
      );
    await reload();
  };

  if (loading) return <Spinner />;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-site-text-muted">
          {t('cohorts-intro', {
            defaultValue:
              'Share of each weekly signup cohort that signed in or acted in each week after joining. Recomputed daily.',
          })}
          {data?.computedAt && (
            <span className="ml-1 text-site-text-dim">
              {t('cohorts-computed', {
                defaultValue: 'Last computed {{date}}.',
                date: new Date(data.computedAt).toLocaleString(),
              })}
            </span>
          )}
        </p>
        <Button size="sm" variant="outline" onClick={recompute} disabled={busy}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          {t('cohorts-recompute', { defaultValue: 'Recompute now' })}
        </Button>
      </div>
      {!data || data.cohorts.length === 0 ? (
        <p className="glass-fill rounded-site p-6 text-center text-sm text-site-text-muted">
          {t('cohorts-empty', {
            defaultValue:
              'No cohort data yet. Press "Recompute now" to build it from sessions and activity.',
          })}
        </p>
      ) : (
        <div className="glass-pane overflow-x-auto rounded-site p-3">
          <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr className="text-site-text-dim">
                <th scope="col" className="px-2 text-left font-mono uppercase tracking-widest">
                  {t('cohorts-col-cohort', { defaultValue: 'Cohort' })}
                </th>
                <th scope="col" className="font-mono">
                  {t('cohorts-col-size', { defaultValue: 'Size' })}
                </th>
                {WEEKS.map((w) => (
                  <th key={w} scope="col" className="font-mono">
                    {t('cohorts-col-week', { defaultValue: 'W{{n}}', n: w })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c) => (
                <tr key={c.cohortWeek}>
                  <th scope="row" className="px-2 text-left font-mono font-normal text-site-text">
                    {c.cohortWeek}
                  </th>
                  <td className="text-site-text-muted">{c.size}</td>
                  {WEEKS.map((w) => {
                    const v = c.weeks[w];
                    return v === undefined ? (
                      <td key={w} />
                    ) : (
                      <td
                        key={w}
                        className="rounded-site-sm px-1 py-1.5 text-site-text"
                        style={{
                          background: `color-mix(in oklab, var(--site-accent) ${Math.round(v * 100)}%, transparent)`,
                        }}
                      >
                        {Math.round(v * 100)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

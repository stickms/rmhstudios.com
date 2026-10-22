import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { PerfOverview } from '@/lib/perf/admin-types';
import { allSnapshots } from '@/lib/perf/derive';
import { fmtClock } from './format';

/** Newest server-side errors across every process, capped for the page. */
export function ErrorsTab({ overview }: { overview: PerfOverview }) {
  const { t } = useTranslation('f-perf');
  const errors = useMemo(
    () =>
      allSnapshots(overview)
        .flatMap((s) => s.errors.map((e) => ({ ...e, service: s.service, pid: s.pid })))
        .sort((a, b) => b.at - a.at)
        .slice(0, 100),
    [overview],
  );

  if (errors.length === 0) {
    return (
      <p className="glass-fill rounded-site p-6 text-center text-sm text-site-text-muted">
        {t('errors-empty', { defaultValue: 'No server errors since the processes started.' })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-site-text-dim">
        {t('errors-note', {
          defaultValue:
            'The 50 most recent 5xx errors held in each process’s memory. They reset when a process restarts.',
        })}
      </p>
      <ul className="space-y-3">
        {errors.map((e) => (
          <li
            key={`${e.service}:${e.pid}:${e.at}:${e.message}`}
            className="glass-fill space-y-1.5 rounded-site p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="danger" size="sm">
                {e.status}
              </Badge>
              <span className="font-mono text-xs break-all text-site-text">{e.route}</span>
              <span className="ml-auto text-xs text-site-text-dim">
                {fmtClock(e.at)} · {e.service}:{e.pid}
              </span>
            </div>
            <p className="text-sm break-words text-site-text">{e.message}</p>
            {e.traceId && (
              <p className="font-mono text-xs break-all text-site-text-muted">
                {t('errors-trace', { defaultValue: 'trace {{id}}', id: e.traceId })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

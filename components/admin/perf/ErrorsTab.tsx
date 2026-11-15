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
      <p className="t-body py-4 text-site-text-muted">
        {t('errors-empty', { defaultValue: 'No server errors since the processes started.' })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="t-body text-site-text-muted">
        {t('errors-note', {
          defaultValue:
            'The 50 most recent 5xx errors held in each process’s memory. They reset when a process restarts.',
        })}
      </p>
      <ul className="divide-y divide-site-border border-t border-site-border">
        {errors.map((e) => (
          <li
            key={`${e.service}:${e.pid}:${e.at}:${e.message}`}
            className="space-y-2 border-t border-site-border pt-4 first:border-t-0 first:pt-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="danger">
                {e.status}
              </Badge>
              <span className="t-meta text-site-text break-all">{e.route}</span>
              <span className="ms-auto t-meta">
                {fmtClock(e.at)} · {e.service}:{e.pid}
              </span>
            </div>
            <p className="t-body break-words text-site-text">{e.message}</p>
            {e.traceId && (
              <p className="t-meta break-all">
                {t('errors-trace', { defaultValue: 'trace {{id}}', id: e.traceId })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

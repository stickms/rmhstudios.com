import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { apiQuery } from '@/lib/contract/client';
import { listAdminJobQueuesApi } from '@/lib/admin/jobs.contract';
import { filterQueues, formatUtc, type QueueSummary } from '@/lib/admin/jobs';
import { LeasedJobs } from '@/components/admin/jobs/LeasedJobs';
import { QueueJobs } from '@/components/admin/jobs/QueueJobs';

function Count({ label, n, danger }: { label: string; n: number; danger?: boolean }) {
  return (
    <span className={cn(danger && n > 0 && 'text-site-danger')}>
      {label} {n}
    </span>
  );
}

function QueueRow({ q }: { q: QueueSummary }) {
  const { t } = useTranslation('admin-jobs');
  return (
    <li className="border-b border-site-border py-3">
      <Link
        to="/admin/jobs"
        search={{
          queue: q.name,
        }}
        className="t-body block break-all font-mono font-medium text-site-text"
      >
        {q.name}
      </Link>
      <p className="t-meta mt-1 flex flex-wrap gap-x-3">
        <Count
          label={t('count-ready', {
            defaultValue: 'Ready',
          })}
          n={q.ready}
        />
        <Count
          label={t('count-deferred', {
            defaultValue: 'Deferred',
          })}
          n={q.deferred}
        />
        <Count
          label={t('count-active', {
            defaultValue: 'Active',
          })}
          n={q.active}
        />
        <Count
          label={t('count-failed', {
            defaultValue: 'Failed',
          })}
          n={q.failed}
          danger
        />
        <Count
          label={t('count-total', {
            defaultValue: 'Total',
          })}
          n={q.total}
        />
        {q.policy ? (
          <span>
            {t('policy', {
              policy: q.policy,
              defaultValue: 'Policy {{policy}}',
            })}
          </span>
        ) : null}
      </p>
      {q.newestFailureAt ? (
        <p className="t-meta mt-1 text-site-danger">
          {t('newest-failure', {
            time: formatUtc(q.newestFailureAt),
            defaultValue: 'Newest failure {{time}}',
          })}
        </p>
      ) : null}
      {q.schedules.map((s) => (
        <p key={s.key} className="t-meta mt-1 break-all">
          {t('schedule', {
            cron: s.cron,
            zone: s.timezone,
            defaultValue: 'Schedule {{cron}} ({{zone}})',
          })}
          {s.nextRunAt
            ? ` · ${t('schedule-next', { time: formatUtc(s.nextRunAt), defaultValue: 'next run {{time}}' })}`
            : ''}
        </p>
      ))}
    </li>
  );
}

/** `/admin/jobs`: every queue, or one queue's jobs when `queue` is set. */
export function JobsConsole({ queue }: { queue: string | undefined }) {
  const { t } = useTranslation('admin-jobs');
  const [needle, setNeedle] = useState('');
  const list = useQuery(apiQuery(listAdminJobQueuesApi));
  const arrival = useArrival(!list.isPending);

  if (queue) {
    return (
      <div className="space-y-4">
        <Link to="/admin/jobs" className="t-body inline-flex items-center gap-1 text-site-text-muted">
          <ArrowLeft className="size-4" aria-hidden />
          {t('back-to-queues', {
            defaultValue: 'All queues',
          })}
        </Link>
        <h2 className="t-heading break-all font-mono">{queue}</h2>
        <QueueJobs queue={queue} />
      </div>
    );
  }

  const queues = filterQueues(list.data?.queues ?? [], needle);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-0 flex-1 basis-56"
          value={needle}
          onChange={(e) => setNeedle(e.target.value)}
          placeholder={t('filter-placeholder', {
            defaultValue: 'Filter queues by name',
          })}
          aria-label={t('filter-label', {
            defaultValue: 'Filter queues by name',
          })}
        />
        <IconButton
          icon={RefreshCw}
          label={t('refresh', {
            defaultValue: 'Refresh',
          })}
          onClick={() => void list.refetch()}
          disabled={list.isFetching}
        />
      </div>
      {list.data?.leased ? <LeasedJobs leased={list.data.leased} /> : null}
      {list.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from(
            {
              length: 5,
            },
            (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ),
          )}
        </div>
      ) : list.isError ? (
        <EmptyState
          title={t('queues-error-title', {
            defaultValue: 'Queues could not be loaded',
          })}
          description={t('queues-error', {
            defaultValue: 'The job queue is not reachable. Refresh to try again.',
          })}
        />
      ) : queues.length === 0 ? (
        <EmptyState
          className={arrival}
          description={
            needle.trim()
              ? t('queues-no-match', {
                  defaultValue: 'No queue matches this name.',
                })
              : t('queues-empty', {
                  defaultValue: 'There are no queues yet.',
                })
          }
        />
      ) : (
        <ul className={cn('border-t border-site-border', arrival)}>
          {queues.map((q) => (
            <QueueRow key={q.name} q={q} />
          ))}
        </ul>
      )}
    </div>
  );
}

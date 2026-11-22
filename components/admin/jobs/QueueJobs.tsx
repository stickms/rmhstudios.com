import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyButton } from '@/components/ui/copy-button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { api } from '@/lib/contract/client';
import { adminJobActionApi, listAdminQueueJobsApi } from '@/lib/admin/jobs.contract';
import { MAX_BULK_JOBS, actionsFor, formatUtc, type JobAction, type JobListState } from '@/lib/admin/jobs';
import { JobDetailDialog } from '@/components/admin/jobs/JobDetailDialog';

/** One queue's jobs in four tabs, 50 to a page, with single and bulk retry, cancel and delete. */
export function QueueJobs({ queue }: { queue: string }) {
  const { t } = useTranslation('admin-jobs');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [state, setState] = useState<JobListState>('failed');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A different queue or tab is a different list: nothing selected carries over.
  const selectionKey = `${queue}\u0000${state}`;
  const [selectedFor, setSelectedFor] = useState(selectionKey);
  if (selectedFor !== selectionKey) {
    // Adjusting state while rendering (no effect): the reset lands in the same render as the new list.
    setSelectedFor(selectionKey);
    setSelected(new Set());
  }

  const list = useInfiniteQuery({
    queryKey: [listAdminQueueJobsApi.path, queue, state],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(listAdminQueueJobsApi, {
        params: {
          queue,
        },
        query: pageParam
          ? {
              state,
              after: pageParam,
            }
          : {
              state,
            },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const jobs = list.data?.pages.flatMap((p) => p.jobs) ?? [];
  const arrival = useArrival(!list.isPending);
  const arrived = useArrivingKeys(jobs.map((j) => j.id));

  const tabs = [
    {
      id: 'failed',
      label: t('tab-failed', {
        defaultValue: 'Failed',
      }),
    },
    {
      id: 'retry',
      label: t('tab-retry', {
        defaultValue: 'Retrying',
      }),
    },
    {
      id: 'active',
      label: t('tab-active', {
        defaultValue: 'Active',
      }),
    },
    {
      id: 'created',
      label: t('tab-created', {
        defaultValue: 'Queued',
      }),
    },
  ];
  const bulkActions = actionsFor(state === 'failed' ? 'failed' : state);

  const run = async (action: JobAction, ids: string[]) => {
    if (ids.length === 0 || busy) return;
    const ok = await confirm(
      action === 'retry'
        ? {
            title: t('confirm-retry-title', {
              count: ids.length,
              defaultValue_one: 'Retry {{count}} job?',
              defaultValue_other: 'Retry {{count}} jobs?',
            }),
            description: t('confirm-retry-description', {
              defaultValue: 'Failed jobs go back to the queue and run again. This adds one attempt to each.',
            }),
            confirmLabel: t('action-retry', {
              defaultValue: 'Retry',
            }),
          }
        : action === 'cancel'
          ? {
              title: t('confirm-cancel-title', {
                count: ids.length,
                defaultValue_one: 'Cancel {{count}} job?',
                defaultValue_other: 'Cancel {{count}} jobs?',
              }),
              description: t('confirm-cancel-description', {
                defaultValue: 'Queued and retrying jobs will not run. An active job may already be half done.',
              }),
              confirmLabel: t('action-cancel', {
                defaultValue: 'Cancel job',
              }),
              danger: true,
            }
          : {
              title: t('confirm-delete-title', {
                count: ids.length,
                defaultValue_one: 'Delete {{count}} job?',
                defaultValue_other: 'Delete {{count}} jobs?',
              }),
              description: t('confirm-delete-description', {
                defaultValue: 'Failed and cancelled jobs are removed for good, with their data and error.',
              }),
              confirmLabel: t('action-delete', {
                defaultValue: 'Delete',
              }),
              danger: true,
            },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api(adminJobActionApi, {
        params: {
          queue,
        },
        body: {
          action,
          ids: ids.join(','),
        },
      });
      const vars = {
        affected: r.affected,
        requested: r.requested,
      };
      toast.success(
        action === 'retry'
          ? t('toast-retry', {
              ...vars,
              defaultValue: 'Retried {{affected}} of {{requested}}.',
            })
          : action === 'cancel'
            ? t('toast-cancel', {
                ...vars,
                defaultValue: 'Cancelled {{affected}} of {{requested}}.',
              })
            : t('toast-delete', {
                ...vars,
                defaultValue: 'Deleted {{affected}} of {{requested}}.',
              }),
      );
      setSelected(new Set());
      setOpenId(null);
      await queryClient.invalidateQueries({
        queryKey: [listAdminQueueJobsApi.path, queue],
      });
      await queryClient.invalidateQueries({
        queryKey: ['/api/admin/jobs'],
      });
    } catch {
      toast.error(
        t('toast-failed', {
          defaultValue: 'The action failed. Refresh and check the list.',
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = jobs.length > 0 && jobs.every((j) => selected.has(j.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(jobs.slice(0, MAX_BULK_JOBS).map((j) => j.id)));

  return (
    <div className="space-y-4">
      <Tabs
        tabs={tabs}
        value={state}
        onChange={(id) => setState(id as JobListState)}
        aria-label={t('tabs-label', {
          defaultValue: 'Job states',
        })}
      />
      <div className="flex flex-wrap items-center gap-2">
        {bulkActions.includes('retry') ? (
          <Button disabled={selected.size === 0 || busy} onClick={() => run('retry', [...selected])}>
            {t('bulk-retry', {
              defaultValue: 'Retry selected',
            })}
          </Button>
        ) : null}
        {bulkActions.includes('cancel') ? (
          <Button disabled={selected.size === 0 || busy} onClick={() => run('cancel', [...selected])}>
            {t('bulk-cancel', {
              defaultValue: 'Cancel selected',
            })}
          </Button>
        ) : null}
        {bulkActions.includes('delete') ? (
          <Button variant="danger" disabled={selected.size === 0 || busy} onClick={() => run('delete', [...selected])}>
            {t('bulk-delete', {
              defaultValue: 'Delete selected',
            })}
          </Button>
        ) : null}
        {selected.size > 0 ? (
          <span className="t-meta">
            {t('selected-count', {
              n: selected.size,
              max: MAX_BULK_JOBS,
              defaultValue: '{{n}} of {{max}} selected',
            })}
          </span>
        ) : null}
        <Button variant="ghost" className="ml-auto" onClick={() => void list.refetch()} disabled={list.isFetching}>
          <RefreshCw aria-hidden />
          {t('refresh', {
            defaultValue: 'Refresh',
          })}
        </Button>
      </div>

      {list.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from(
            {
              length: 4,
            },
            (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ),
          )}
        </div>
      ) : list.isError ? (
        <EmptyState
          title={t('jobs-error-title', {
            defaultValue: 'Jobs could not be loaded',
          })}
          description={t('jobs-error', {
            defaultValue: 'The queue database did not answer. Refresh to try again.',
          })}
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          className={arrival}
          description={t('jobs-empty', {
            defaultValue: 'No jobs in this state.',
          })}
        />
      ) : (
        <div className={arrival}>
          <label className="t-meta flex items-center gap-2 border-b border-site-border pb-2">
            <input type="checkbox" className="size-4" checked={allSelected} onChange={toggleAll} />
            {t('select-all', {
              defaultValue: 'Select all loaded jobs',
            })}
          </label>
          <ul>
            {jobs.map((job) => (
              <li
                key={job.id}
                className={cn('flex items-start gap-3 border-b border-site-border py-3', arrived(job.id) && 'arrive')}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0"
                  aria-label={t('select-job', {
                    id: job.id,
                    defaultValue: 'Select job {{id}}',
                  })}
                  checked={selected.has(job.id)}
                  disabled={!selected.has(job.id) && selected.size >= MAX_BULK_JOBS}
                  onChange={() => toggle(job.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <button
                      type="button"
                      className="t-meta min-w-0 break-all text-left text-site-text underline"
                      onClick={() => setOpenId(job.id)}
                    >
                      {job.id}
                    </button>
                    <CopyButton
                      value={job.id}
                      variant="ghost"
                      size="icon-xs"
                      label={t('copy-id', {
                        defaultValue: 'Copy job id',
                      })}
                    />
                  </div>
                  <p className="t-meta mt-1">
                    {t('row-created', {
                      time: formatUtc(job.createdOn),
                      defaultValue: 'Created {{time}}',
                    })}
                    {job.startedOn
                      ? ` · ${t('row-started', { time: formatUtc(job.startedOn), defaultValue: 'started {{time}}' })}`
                      : ''}
                    {job.completedOn
                      ? ` · ${t('row-finished', { time: formatUtc(job.completedOn), defaultValue: 'finished {{time}}' })}`
                      : ''}
                    {` · ${t('row-retries', { count: job.retryCount, limit: job.retryLimit, defaultValue: 'retry {{count}} of {{limit}}' })}`}
                  </p>
                  {job.error ? <p className="t-body mt-1 break-words text-site-danger">{job.error}</p> : null}
                </div>
              </li>
            ))}
          </ul>
          {list.hasNextPage ? (
            <Button className="mt-3" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              {t('load-more', {
                defaultValue: 'Load more',
              })}
            </Button>
          ) : null}
        </div>
      )}

      <JobDetailDialog
        queue={queue}
        id={openId}
        onClose={() => setOpenId(null)}
        onAction={(action, id) => void run(action, [id])}
      />
    </div>
  );
}

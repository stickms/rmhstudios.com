import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { api, apiQuery } from '@/lib/contract/client';
import { adminOutboxActionApi, getAdminOutboxApi, listAdminOutboxEventsApi } from '@/lib/admin/outbox.contract';
import { formatUtc } from '@/lib/admin/jobs';
import {
  MAX_BULK_EVENTS,
  MAX_TOPIC_EVENTS,
  actionsForState,
  ageOf,
  type OutboxAction,
  type OutboxListState,
  type TopicSummary,
} from '@/lib/admin/outbox-admin';
import { OutboxEventDialog } from '@/components/admin/outbox/OutboxEventDialog';

function Count({ label, n, danger }: { label: string; n: number; danger?: boolean }) {
  return (
    <span className={cn(danger && n > 0 && 'text-site-danger')}>
      {label} {n}
    </span>
  );
}

function TopicRow({ s, now }: { s: TopicSummary; now: number }) {
  const { t } = useTranslation('admin-outbox');
  const age = ageOf(s.oldestPendingAt, now);
  return (
    <li className="border-b border-site-border py-3">
      <Link
        to="/admin/outbox"
        search={{
          topic: s.topic,
        }}
        className="t-body block break-all font-mono font-medium text-site-text"
      >
        {s.topic}
      </Link>
      <p className="t-meta mt-1 flex flex-wrap gap-x-3">
        <Count
          label={t('count-dead', {
            defaultValue: 'Dead',
          })}
          n={s.dead}
          danger
        />
        <Count
          label={t('count-due', {
            defaultValue: 'Pending',
          })}
          n={s.pendingDue}
        />
        <Count
          label={t('count-scheduled', {
            defaultValue: 'Scheduled',
          })}
          n={s.scheduled}
        />
        <Count
          label={t('count-delivered', {
            defaultValue: 'Delivered 24 h',
          })}
          n={s.delivered24h}
        />
        {age ? (
          <span>
            {t('oldest-pending', {
              age,
              defaultValue: 'Oldest pending {{age}}',
            })}
          </span>
        ) : null}
      </p>
    </li>
  );
}

/** One topic's events in two tabs (dead, pending), 50 to a page, with requeue and discard. */
function TopicEvents({ topic, deadCount }: { topic: string; deadCount: number }) {
  const { t } = useTranslation('admin-outbox');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [state, setState] = useState<OutboxListState>('dead');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A different topic or tab is a different list: nothing selected carries over.
  const selectionKey = `${topic}\u0000${state}`;
  const [selectedFor, setSelectedFor] = useState(selectionKey);
  if (selectedFor !== selectionKey) {
    // Adjusting state while rendering (no effect): the reset lands in the same render as the new list.
    setSelectedFor(selectionKey);
    setSelected(new Set());
  }

  const list = useInfiniteQuery({
    queryKey: [listAdminOutboxEventsApi.path, topic, state],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(listAdminOutboxEventsApi, {
        query: pageParam
          ? {
              topic,
              state,
              after: pageParam,
            }
          : {
              topic,
              state,
            },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const events = list.data?.pages.flatMap((p) => p.events) ?? [];
  const arrival = useArrival(!list.isPending);
  const arrived = useArrivingKeys(events.map((e) => e.id));
  const bulk = actionsForState(state);

  const tabs = [
    {
      id: 'dead',
      label: t('tab-dead', {
        defaultValue: 'Dead',
      }),
    },
    {
      id: 'pending',
      label: t('tab-pending', {
        defaultValue: 'Pending',
      }),
    },
  ];

  const run = async (action: OutboxAction, ids: string[] | 'all') => {
    const count = ids === 'all' ? Math.min(deadCount, MAX_TOPIC_EVENTS) : ids.length;
    if (count === 0 || busy) return;
    const ok = await confirm(
      action === 'requeue'
        ? {
            title: t('confirm-requeue-title', {
              count,
              defaultValue_one: 'Requeue {{count}} event?',
              defaultValue_other: 'Requeue {{count}} events?',
            }),
            description: t('confirm-requeue-description', {
              defaultValue:
                'Each goes back to the queue with its attempts reset and is delivered again. The receiver must tolerate a repeat delivery.',
            }),
            confirmLabel: t('action-requeue', {
              defaultValue: 'Requeue',
            }),
          }
        : {
            title: t('confirm-discard-title', {
              count,
              defaultValue_one: 'Discard {{count}} event?',
              defaultValue_other: 'Discard {{count}} events?',
            }),
            description: t('confirm-discard-description', {
              defaultValue: 'Dead events are removed for good, with their payload and error. They are never delivered.',
            }),
            confirmLabel: t('action-discard', {
              defaultValue: 'Discard',
            }),
            danger: true,
          },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api(adminOutboxActionApi, {
        body:
          ids === 'all'
            ? {
                action,
                topic,
                allDead: true,
              }
            : {
                action,
                ids: ids.join(','),
              },
      });
      const vars = {
        affected: r.affected,
        requested: r.requested,
      };
      toast.success(
        action === 'requeue'
          ? t('toast-requeue', {
              ...vars,
              defaultValue: 'Requeued {{affected}} of {{requested}}.',
            })
          : t('toast-discard', {
              ...vars,
              defaultValue: 'Discarded {{affected}} of {{requested}}.',
            }),
      );
      setSelected(new Set());
      setOpenId(null);
      await queryClient.invalidateQueries({
        queryKey: [listAdminOutboxEventsApi.path, topic],
      });
      await queryClient.invalidateQueries({
        queryKey: [getAdminOutboxApi.path],
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
  const allSelected = events.length > 0 && events.every((e) => selected.has(e.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(events.slice(0, MAX_BULK_EVENTS).map((e) => e.id)));

  return (
    <div className="space-y-4">
      <Tabs
        tabs={tabs}
        value={state}
        onChange={(id) => setState(id as OutboxListState)}
        aria-label={t('tabs-label', {
          defaultValue: 'Event states',
        })}
      />
      <div className="flex flex-wrap items-center gap-2">
        {bulk.includes('requeue') ? (
          <Button disabled={selected.size === 0 || busy} onClick={() => run('requeue', [...selected])}>
            {t('bulk-requeue', {
              defaultValue: 'Requeue selected',
            })}
          </Button>
        ) : null}
        {bulk.includes('discard') ? (
          <Button variant="danger" disabled={selected.size === 0 || busy} onClick={() => run('discard', [...selected])}>
            {t('bulk-discard', {
              defaultValue: 'Discard selected',
            })}
          </Button>
        ) : null}
        {bulk.includes('requeue') ? (
          <Button disabled={deadCount === 0 || busy} onClick={() => run('requeue', 'all')}>
            {t('requeue-all', {
              defaultValue: 'Requeue all dead in this topic',
            })}
          </Button>
        ) : null}
        {selected.size > 0 ? (
          <span className="t-meta">
            {t('selected-count', {
              n: selected.size,
              max: MAX_BULK_EVENTS,
              defaultValue: '{{n}} of {{max}} selected',
            })}
          </span>
        ) : null}
        <IconButton
          icon={RefreshCw}
          className="ms-auto"
          label={t('refresh', {
            defaultValue: 'Refresh',
          })}
          onClick={() => void list.refetch()}
          disabled={list.isFetching}
        />
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
          title={t('events-error-title', {
            defaultValue: 'Events could not be loaded',
          })}
          description={t('events-error', {
            defaultValue: 'The request failed. Refresh to try again.',
          })}
        />
      ) : events.length === 0 ? (
        <EmptyState
          className={arrival}
          description={
            state === 'dead'
              ? t('events-empty-dead', {
                  defaultValue: 'No dead events in this topic.',
                })
              : t('events-empty-pending', {
                  defaultValue: 'No pending events in this topic.',
                })
          }
        />
      ) : (
        <div className={arrival}>
          {bulk.length > 0 ? (
            <label className="t-meta flex items-center gap-2 border-b border-site-border pb-2">
              <input type="checkbox" className="size-4" checked={allSelected} onChange={toggleAll} />
              {t('select-all', {
                defaultValue: 'Select all loaded events',
              })}
            </label>
          ) : null}
          <ul>
            {events.map((e) => (
              <li
                key={e.id}
                className={cn('flex items-start gap-3 border-b border-site-border py-3', arrived(e.id) && 'arrive')}
              >
                {bulk.length > 0 ? (
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    aria-label={t('select-event', {
                      id: e.id,
                      defaultValue: 'Select event {{id}}',
                    })}
                    checked={selected.has(e.id)}
                    disabled={!selected.has(e.id) && selected.size >= MAX_BULK_EVENTS}
                    onChange={() => toggle(e.id)}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="t-meta min-w-0 break-all text-left text-site-text underline"
                    onClick={() => setOpenId(e.id)}
                  >
                    {e.id}
                  </button>
                  <p className="t-meta mt-1">
                    {t('row-created', {
                      time: formatUtc(e.createdAt),
                      defaultValue: 'Created {{time}}',
                    })}
                    {` · ${t('row-attempts', { n: e.attempts, defaultValue: 'attempts {{n}}' })}`}
                    {e.deadAt
                      ? ` · ${t('row-dead', { time: formatUtc(e.deadAt), defaultValue: 'gave up {{time}}' })}`
                      : ` · ${t('row-next', { time: formatUtc(e.nextAttempt), defaultValue: 'next attempt {{time}}' })}`}
                  </p>
                  {e.error ? <p className="t-body mt-1 break-words text-site-danger">{e.error}</p> : null}
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
      <OutboxEventDialog
        id={openId}
        onClose={() => setOpenId(null)}
        onAction={(action, id) => void run(action, [id])}
      />
    </div>
  );
}

/** `/admin/outbox`: every topic, or one topic's events when `topic` is set. */
export function OutboxConsole({ topic }: { topic: string | undefined }) {
  const { t } = useTranslation('admin-outbox');
  const summary = useQuery(apiQuery(getAdminOutboxApi));
  const arrival = useArrival(!summary.isPending);

  if (topic) {
    const row = summary.data?.topics.find((s) => s.topic === topic);
    return (
      <div className="space-y-4">
        <Link to="/admin/outbox" className="t-body inline-flex items-center gap-1 text-site-text-muted">
          <ArrowLeft className="size-4" aria-hidden />
          {t('back-to-topics', {
            defaultValue: 'All topics',
          })}
        </Link>
        <h2 className="t-heading break-all font-mono">{topic}</h2>
        <TopicEvents topic={topic} deadCount={row?.dead ?? 0} />
      </div>
    );
  }

  const topics = summary.data?.topics ?? [];
  const now = summary.data ? new Date(summary.data.now).getTime() : 0;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <IconButton
          icon={RefreshCw}
          label={t('refresh', {
            defaultValue: 'Refresh',
          })}
          onClick={() => void summary.refetch()}
          disabled={summary.isFetching}
        />
      </div>
      {summary.isPending ? (
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
      ) : summary.isError ? (
        <EmptyState
          title={t('topics-error-title', {
            defaultValue: 'Topics could not be loaded',
          })}
          description={t('topics-error', {
            defaultValue: 'The request failed. Refresh to try again.',
          })}
        />
      ) : topics.length === 0 ? (
        <EmptyState
          className={arrival}
          description={t('topics-empty', {
            defaultValue: 'The outbox is empty.',
          })}
        />
      ) : (
        <ul className={cn('border-t border-site-border', arrival)}>
          {topics.map((s) => (
            <TopicRow key={s.topic} s={s} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

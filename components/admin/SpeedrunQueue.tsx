import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api, apiQuery } from '@/lib/contract/client';
import { errorField } from '@/lib/http';
import { toast } from '@/lib/toast';
import { isolateText } from '@/lib/i18n/user-text';
import {
  speedrunQueueActionApi,
  speedrunQueueApi,
  type SpeedrunQueueAction,
  type SpeedrunQueueRow,
  type SpeedrunQueueView,
} from '@/lib/speedrun/queue.contract';
import { formatRunTime } from '@/lib/speedrun/versions';

const REASON_MAX = 200;

/** `initial` is the first page of the pending view, read by the route's guarded server function. */
export function SpeedrunQueue({ initial }: { initial: SpeedrunQueueRow[] }) {
  const { t } = useTranslation('speedrun-queue');
  const fmt = useLocaleFormat();
  const prompt = usePrompt();
  const queryClient = useQueryClient();
  const [view, setView] = useState<SpeedrunQueueView>('pending');

  const list = useQuery({
    ...apiQuery(speedrunQueueApi, { query: { view } }),
    ...(view === 'pending' ? { initialData: { rows: initial } } : {}),
  });
  const arrival = useArrival(!list.isPending);

  const refresh = () => queryClient.invalidateQueries({ queryKey: [speedrunQueueApi.path] });

  const act = useMutation({
    mutationFn: (body: SpeedrunQueueAction) => api(speedrunQueueActionApi, { body }),
    onSuccess: (_data, body) => {
      void refresh();
      toast.success(
        body.action === 'reopen'
          ? t('reopened', { defaultValue: 'The run is back in the queue.' })
          : body.status === 'verified'
            ? t('verified', { defaultValue: 'Run verified. It is on the board.' })
            : t('rejected', { defaultValue: 'Run rejected. The runner was told why.' }),
      );
    },
    onError: (error, body) => {
      void refresh();
      const decidedBy = errorField<{ name: string | null } | null>(error, 'decidedBy');
      if (body.action === 'review' && errorField(error, 'status') !== undefined) {
        toast.error(
          decidedBy?.name
            ? t('already-decided-by', {
                name: isolateText(decidedBy.name),
                defaultValue: 'Already decided by {{name}}.',
              })
            : t('already-decided', { defaultValue: 'Already decided.' }),
        );
        return;
      }
      if (body.action === 'reopen' && errorField(error, 'status') !== undefined) {
        toast.error(
          t('already-changed', { defaultValue: 'This run was changed by someone else. The list is updated.' }),
        );
        return;
      }
      toast.error(t('action-error', { defaultValue: 'That did not go through. Try again.' }));
    },
  });

  const validate = (required: boolean) => (value: string) => {
    const text = value.trim();
    if (required && text.length === 0) return t('reason-required', { defaultValue: 'Write a reason.' });
    if (text.length > REASON_MAX) {
      return t('reason-too-long', { max: REASON_MAX, defaultValue: 'Keep it to {{max}} characters.' });
    }
    return null;
  };

  const verify = async (row: SpeedrunQueueRow) => {
    const reason = await prompt({
      title: t('verify-title', { defaultValue: 'Verify this run' }),
      label: t('verify-label', { defaultValue: 'Note (optional)' }),
      confirmLabel: t('verify-action', { defaultValue: 'Verify run' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      validate: validate(false),
    });
    if (reason === null) return;
    act.mutate({ action: 'review', entryId: row.id, status: 'verified', reason: reason.trim() || undefined });
  };

  const reject = async (row: SpeedrunQueueRow) => {
    const reason = await prompt({
      title: t('reject-title', { defaultValue: 'Reject this run' }),
      label: t('reject-label', { defaultValue: 'Reason (the runner will read it)' }),
      confirmLabel: t('reject-action', { defaultValue: 'Reject run' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      validate: validate(true),
    });
    if (reason === null) return;
    act.mutate({ action: 'review', entryId: row.id, status: 'rejected', reason: reason.trim() });
  };

  const reopen = async (row: SpeedrunQueueRow) => {
    if (row.status === 'pending') return;
    const reason = await prompt({
      title: t('reopen-title', { defaultValue: 'Reopen this run' }),
      label: t('reopen-label', { defaultValue: 'Why is it being reopened?' }),
      confirmLabel: t('reopen-action', { defaultValue: 'Reopen run' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      validate: validate(true),
    });
    if (reason === null) return;
    act.mutate({ action: 'reopen', entryId: row.id, from: row.status, reason: reason.trim() });
  };

  const tabs: TabItem[] = [
    { id: 'pending', label: t('tab-pending', { defaultValue: 'Waiting' }) },
    { id: 'decided', label: t('tab-decided', { defaultValue: 'Recently decided' }) },
  ];

  const rows = list.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <Tabs
        tabs={tabs}
        value={view}
        onChange={(id) => setView(id === 'decided' ? 'decided' : 'pending')}
        idBase="speedrun-queue"
        aria-label={t('tabs-label', { defaultValue: 'Speedrun lists' })}
      />

      {list.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.isError ? (
        <p role="alert" className="t-body text-site-danger">
          {t('load-error', { defaultValue: 'The runs could not be loaded.' })}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            view === 'pending'
              ? t('empty-pending-title', { defaultValue: 'Nothing is waiting' })
              : t('empty-decided-title', { defaultValue: 'No verdicts yet' })
          }
          description={
            view === 'pending'
              ? t('empty-pending-description', {
                  defaultValue: 'Runs that automation cannot settle appear here, oldest first.',
                })
              : t('empty-decided-description', { defaultValue: 'Verdicts you and other admins give are listed here.' })
          }
        />
      ) : (
        <ul className={`border-t border-site-border ${arrival ?? ''}`}>
          {rows.map((row) => (
            <li key={row.id} className="border-b border-site-border py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="t-heading min-w-0 break-words">
                  {t('row-title', {
                    game: row.gameTitle,
                    category: row.categoryName,
                    defaultValue: '{{game}}: {{category}}',
                  })}
                </p>
                <p className="t-meta">
                  {row.metric === 'score' && row.score !== null
                    ? t('row-score', {
                        score: fmt.number(row.score),
                        time: formatRunTime(row.timeMs),
                        defaultValue: '{{score}} points in {{time}}',
                      })
                    : formatRunTime(row.timeMs)}
                </p>
              </div>
              <p className="t-meta mt-1">
                {t('row-runner', {
                  name: isolateText(row.runner.name ?? row.runner.handle ?? row.runner.id),
                  defaultValue: 'by {{name}}',
                })}
                {' · '}
                {t('row-version', { version: row.version, defaultValue: 'version {{version}}' })}
                {' · '}
                {row.tier === 'deterministic'
                  ? t('tier-deterministic', { defaultValue: 'Re-simulated' })
                  : row.tier === 'consistency'
                    ? t('tier-consistency', { defaultValue: 'Checked for consistency' })
                    : t('tier-manual', { defaultValue: 'Manual only' })}
                {' · '}
                {fmt.dateTime(row.createdAt)}
              </p>
              {row.note ? (
                <p dir="auto" className="t-body mt-1 break-words text-site-text-muted">
                  {row.note}
                </p>
              ) : null}
              {view === 'decided' ? (
                <p className="t-meta mt-1">
                  {row.status === 'verified'
                    ? t('decided-verified', { defaultValue: 'Verified' })
                    : t('decided-rejected', { defaultValue: 'Rejected' })}
                  {' · '}
                  {row.decidedBy?.name
                    ? t('decided-by', { name: isolateText(row.decidedBy.name), defaultValue: 'by {{name}}' })
                    : t('decided-by-unknown', { defaultValue: 'by an admin' })}
                  {row.reviewedAt ? ` · ${fmt.dateTime(row.reviewedAt)}` : ''}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="ghost">
                  <Link to="/replays/$id" params={{ id: row.replayId }}>
                    {t('watch-replay', { defaultValue: 'Watch replay' })}
                  </Link>
                </Button>
                {view === 'pending' ? (
                  <>
                    <Button size="sm" disabled={act.isPending} onClick={() => void verify(row)}>
                      {t('verify', { defaultValue: 'Verify' })}
                    </Button>
                    <Button size="sm" variant="danger" disabled={act.isPending} onClick={() => void reject(row)}>
                      {t('reject', { defaultValue: 'Reject' })}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" disabled={act.isPending} onClick={() => void reopen(row)}>
                    {t('reopen', { defaultValue: 'Reopen' })}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

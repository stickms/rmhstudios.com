import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { listSweepsApi, undoSweepApi } from '@/lib/admin/sweeps.contract';
import type { SweepStatus, SweepView } from '@/lib/admin/sweeps';
import { sweepRefusalText } from '@/components/admin/sweeps/sweep-refusal';

/** Rows on rules: who, the window, what was removed, the state and Undo. */
export function SweepsList() {
  const { t } = useTranslation('admin-spam-sweep');
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const list = useQuery({
    ...apiQuery(listSweepsApi, { query: {} }),
    // A run in progress is followed; otherwise the list is at rest.
    refetchInterval: (query) => (query.state.data?.sweeps.some((s) => s.status === 'RUNNING') ? 5_000 : false),
  });
  const arrival = useArrival(!list.isPending);

  const undo = useMutation({
    mutationFn: (id: string) => api(undoSweepApi, { params: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [listSweepsApi.path] });
      toast.success(t('undo-started', { defaultValue: 'The undo is running.' }));
    },
    onError: (e) => toast.error(sweepRefusalText(t, e)),
  });

  const statusLabel: Record<SweepStatus, string> = {
    PREVIEW: t('status-preview', { defaultValue: 'Preview' }),
    RUNNING: t('status-running', { defaultValue: 'Running' }),
    DONE: t('status-done', { defaultValue: 'Done' }),
    FAILED: t('status-failed', { defaultValue: 'Failed' }),
    UNDONE: t('status-undone', { defaultValue: 'Undone' }),
  };

  const askUndo = async (s: SweepView) => {
    const ok = await confirm({
      title: t('undo-title', { defaultValue: 'Undo this sweep?' }),
      description: t('undo-body', {
        number: fmt.number(s.removedCount),
        count: Number(fmt.number(s.removedCount)),
        defaultValue_one:
          'Up to {{number}} item come back, except any that were removed again or deleted by their author. Its strike is withdrawn and the member gets one notice.',
        defaultValue:
          'Up to {{number}} items come back, except any that were removed again or deleted by their author. Its strike is withdrawn and the member gets one notice.',
      }),
      confirmLabel: t('undo-action', { defaultValue: 'Undo sweep' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
    });
    if (ok) undo.mutate(s.id);
  };

  if (list.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <p role="alert" className="t-body text-site-danger">
        {t('load-error', { defaultValue: 'The sweeps could not be loaded.' })}
      </p>
    );
  }
  const sweeps = list.data.sweeps;
  if (sweeps.length === 0) {
    return (
      <EmptyState
        title={t('empty-title', { defaultValue: 'No sweeps yet' })}
        description={t('empty-description', {
          defaultValue: "Start one from a member's admin view or from the lookup.",
        })}
      />
    );
  }

  return (
    <ul className={`border-t border-site-border ${arrival ?? ''}`}>
      {sweeps.map((s) => (
        <li key={s.id} className="border-b border-site-border py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="t-heading min-w-0 break-words">
              <Link to="/admin/users" search={{ open: s.subjectId }} className="underline">
                {s.subjectName || s.subjectId}
              </Link>
            </p>
            <p className="t-meta">{statusLabel[s.status]}</p>
          </div>
          <p className="t-meta mt-1">
            {t('row-window', {
              from: fmt.dateTime(s.from),
              to: fmt.dateTime(s.to),
              defaultValue: '{{from}} to {{to}}',
            })}
          </p>
          <p className="t-meta">
            {s.status === 'PREVIEW' || s.phase === 'remove'
              ? t('row-removed', {
                  removed: fmt.number(s.removedCount),
                  total: fmt.number(s.postCount + s.replyCount),
                  defaultValue: '{{removed}} of {{total}} removed',
                })
              : t('row-restored', {
                  restored: fmt.number(s.restoredCount),
                  total: fmt.number(s.removedCount),
                  defaultValue: '{{restored}} of {{total}} restored',
                })}
            {' · '}
            {t('row-admin', { name: s.adminName || s.adminId, defaultValue: 'by {{name}}' })}
            {' · '}
            {fmt.dateTime(s.createdAt)}
          </p>
          <p className="t-body mt-1 break-words">{s.reason}</p>
          {s.error ? <p className="t-meta text-site-danger">{s.error}</p> : null}
          {s.canUndo ? (
            <div className="mt-2">
              <Button size="sm" variant="default" disabled={undo.isPending} onClick={() => void askUndo(s)}>
                {t('undo-button', { defaultValue: 'Undo' })}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

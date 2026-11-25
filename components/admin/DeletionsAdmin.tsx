import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { BarChart } from '@/components/ui/bar-chart';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { api } from '@/lib/contract/client';
import { listAdminDeletionsApi, retryAdminErasureApi } from '@/lib/admin/deletions.contract';
import type { BillingState, HoldCounts, OverdueDeletionRow, WaitingDeletionRow } from '@/lib/admin/deletions';

/**
 * /admin/deletions: three sections on rules. Waiting (scheduled deletions, oldest due first, with what the deletion
 * hold paused), Overdue (due over 24 hours ago, with the last attempt's error name and the attempt count, and the
 * one audited "Try again now") and Finished (the last 30 days, per day). A row carries the member's id and handle
 * only; never an e-mail address, an error message or a stack.
 */
export function DeletionsAdmin() {
  const { t } = useTranslation('admin-deletions');
  const refusalText = useRefusalText();
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const list = useQuery({
    queryKey: [listAdminDeletionsApi.path],
    queryFn: ({ signal }) => api(listAdminDeletionsApi, { signal }),
  });
  const arrival = useArrival(!list.isPending);

  const member = (row: { handle: string | null; userId: string }) => (
    <>
      <p className="t-body break-words text-site-text">
        {row.handle ? <bdi>@{row.handle}</bdi> : t('no-handle', { defaultValue: 'No handle' })}
      </p>
      <p className="t-meta break-all text-site-text-muted" dir="ltr">
        {row.userId}
      </p>
    </>
  );

  const held = (h: HoldCounts) =>
    t('held', {
      defaultValue: '{{keys}} keys, {{webhooks}} webhooks, {{subscriptions}} subscriptions',
      keys: fmt.number(h.keys),
      webhooks: fmt.number(h.webhooks),
      subscriptions: fmt.number(h.subscriptions),
    });

  const billing = (b: BillingState) => {
    switch (b) {
      case 'stopped':
        return t('billing-stopped', { defaultValue: 'Stopped' });
      case 'none':
        return t('billing-none', { defaultValue: 'Nothing to stop' });
      case 'pending':
        return t('billing-pending', { defaultValue: 'Not stopped yet' });
    }
  };

  const retry = async (row: OverdueDeletionRow) => {
    const ok = await confirm({
      title: t('retry-title', { defaultValue: 'Try this deletion again now?' }),
      description: t('retry-description', {
        defaultValue: 'The account is erased now and cannot be restored. The action is recorded in the audit log.',
      }),
      confirmLabel: t('retry-confirm', { defaultValue: 'Erase account' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
    });
    if (!ok) return;
    setBusy(row.userId);
    try {
      const out = await api(retryAdminErasureApi, { params: { userId: row.userId } });
      if (out.erased) toast.success(t('retry-done', { defaultValue: 'The account was erased.' }));
      else
        toast.error(
          t('retry-failed-named', {
            defaultValue: 'The erasure failed again: {{name}}.',
            name: out.errorName ?? '',
          }),
        );
      await queryClient.invalidateQueries({ queryKey: [listAdminDeletionsApi.path] });
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ?? t('retry-error', { defaultValue: 'The erasure did not start. Try again.' }),
      );
    } finally {
      setBusy(null);
    }
  };

  if (list.isPending)
    return (
      <div className="space-y-3" aria-busy="true" aria-label={t('loading', { defaultValue: 'Loading deletions' })}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  if (list.isError)
    return (
      <div role="alert" className="space-y-3 border-b border-site-border py-4">
        <p className="t-body text-site-danger">{t('load-failed', { defaultValue: 'The deletions did not load.' })}</p>
        <Button variant="default" onClick={() => void list.refetch()}>
          {t('retry-load', { defaultValue: 'Try again' })}
        </Button>
      </div>
    );

  const data = list.data;
  const th = 't-label py-2 pe-3 text-start';

  const waitingRows = (rows: WaitingDeletionRow[]) =>
    rows.map((r) => (
      <tr key={r.userId} className="border-b border-site-border align-top">
        <td className="py-3 pe-3">{member(r)}</td>
        <td className="t-meta py-3 pe-3 text-site-text">{fmt.date(r.requestedAt)}</td>
        <td className="t-meta py-3 pe-3 text-site-text">{fmt.date(r.dueAt)}</td>
        <td className="t-meta py-3 pe-3 text-site-text">{billing(r.billing)}</td>
        <td className="t-meta py-3 text-site-text-muted">{held(r.held)}</td>
      </tr>
    ));

  return (
    <div className={`space-y-8 ${arrival ?? ''}`}>
      <section aria-labelledby="deletions-waiting-heading" className="space-y-3">
        <h2 id="deletions-waiting-heading" className="t-heading text-site-text">
          {t('waiting-heading', { defaultValue: 'Waiting' })}
        </h2>
        <p className="t-meta text-site-text-muted">
          {t('waiting-total', {
            defaultValue_one: '{{n}} account in its grace period',
            defaultValue: '{{n}} accounts in their grace period',
            count: data.waitingTotal,
            n: fmt.number(data.waitingTotal),
          })}
        </p>
        {data.waiting.length === 0 ? (
          <EmptyState
            title={t('waiting-empty-title', { defaultValue: 'No deletions waiting' })}
            description={t('waiting-empty-description', {
              defaultValue: 'No account is scheduled for deletion right now.',
            })}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-start">
              <caption className="sr-only">{t('waiting-caption', { defaultValue: 'Deletions waiting' })}</caption>
              <thead>
                <tr className="border-b border-site-border">
                  <th scope="col" className={th}>
                    {t('col-member', { defaultValue: 'Member' })}
                  </th>
                  <th scope="col" className={th}>
                    {t('col-requested', { defaultValue: 'Requested' })}
                  </th>
                  <th scope="col" className={th}>
                    {t('col-due', { defaultValue: 'Due' })}
                  </th>
                  <th scope="col" className={th}>
                    {t('col-billing', { defaultValue: 'Billing' })}
                  </th>
                  <th scope="col" className="t-label py-2 text-start">
                    {t('col-paused', { defaultValue: 'Paused by the hold' })}
                  </th>
                </tr>
              </thead>
              <tbody>{waitingRows(data.waiting)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="deletions-overdue-heading" className="space-y-3">
        <h2 id="deletions-overdue-heading" className="t-heading text-site-text">
          {t('overdue-heading', { defaultValue: 'Overdue' })}
        </h2>
        <p className="t-meta text-site-text-muted">
          {t('overdue-total', {
            defaultValue_one: '{{n}} account due more than 24 hours ago and not erased',
            defaultValue: '{{n}} accounts due more than 24 hours ago and not erased',
            count: data.overdueTotal,
            n: fmt.number(data.overdueTotal),
          })}
        </p>
        {data.overdue.length === 0 ? (
          <EmptyState
            title={t('overdue-empty-title', { defaultValue: 'Nothing overdue' })}
            description={t('overdue-empty-description', { defaultValue: 'Every due deletion has been carried out.' })}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-start">
              <caption className="sr-only">{t('overdue-caption', { defaultValue: 'Overdue deletions' })}</caption>
              <thead>
                <tr className="border-b border-site-border">
                  <th scope="col" className={th}>
                    {t('col-member', { defaultValue: 'Member' })}
                  </th>
                  <th scope="col" className={th}>
                    {t('col-due', { defaultValue: 'Due' })}
                  </th>
                  <th scope="col" className={th}>
                    {t('col-billing', { defaultValue: 'Billing' })}
                  </th>
                  <th scope="col" className={th}>
                    {t('col-attempts', { defaultValue: 'Attempts' })}
                  </th>
                  <th scope="col" className={th}>
                    {t('col-last-error', { defaultValue: 'Last error' })}
                  </th>
                  <th scope="col" className="t-label py-2 text-end">
                    {t('col-actions', { defaultValue: 'Actions' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.overdue.map((r) => (
                  <tr key={r.userId} className="border-b border-site-border align-top">
                    <td className="py-3 pe-3">{member(r)}</td>
                    <td className="t-meta py-3 pe-3 text-site-text">{fmt.date(r.dueAt)}</td>
                    <td className="t-meta py-3 pe-3 text-site-text">{billing(r.billing)}</td>
                    <td className="t-meta py-3 pe-3 text-site-text">{fmt.number(r.attempts)}</td>
                    <td
                      className={`t-meta py-3 pe-3 break-all ${!r.running && r.lastErrorName ? 'text-site-danger' : 'text-site-text-muted'}`}
                      dir="ltr"
                    >
                      {r.running
                        ? t('running', { defaultValue: 'Running now' })
                        : (r.lastErrorName ?? t('no-error', { defaultValue: 'No attempt failed yet' }))}
                    </td>
                    <td className="py-3 text-end">
                      <Button variant="default" disabled={busy === r.userId || r.running} onClick={() => void retry(r)}>
                        {t('retry', { defaultValue: 'Try again now' })}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="deletions-finished-heading" className="space-y-3">
        <h2 id="deletions-finished-heading" className="t-heading text-site-text">
          {t('finished-heading', { defaultValue: 'Finished' })}
        </h2>
        <p className="t-meta text-site-text-muted">
          {t('finished-total', {
            defaultValue_one: '{{n}} erasure in the last 30 days',
            defaultValue: '{{n}} erasures in the last 30 days',
            count: data.finishedTotal,
            n: fmt.number(data.finishedTotal),
          })}
        </p>
        {data.finishedTotal === 0 ? (
          <EmptyState
            title={t('finished-empty-title', { defaultValue: 'No erasures finished' })}
            description={t('finished-empty-description', {
              defaultValue: 'No account was erased in the last 30 days.',
            })}
          />
        ) : (
          <BarChart
            bars={data.finished.map((d) => ({ label: d.day, value: d.count }))}
            label={t('finished-chart-label', { defaultValue: 'Erasures finished per day' })}
            summary={t('finished-chart-total', {
              defaultValue_one: '{{n}} erasure finished in the last 30 days, per day',
              defaultValue: '{{n}} erasures finished in the last 30 days, per day',
              count: data.finishedTotal,
              n: fmt.number(data.finishedTotal),
            })}
            columns={{
              label: t('finished-col-day', { defaultValue: 'Day' }),
              value: t('finished-col-count', { defaultValue: 'Erasures' }),
            }}
          />
        )}
      </section>
    </div>
  );
}

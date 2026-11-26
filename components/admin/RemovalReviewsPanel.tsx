/**
 * Removal reviews (sprint 15, feature 16) — the "Removal reviews" tab of `/admin/appeals`: members asking a moderator to
 * look again at something a report took down. Uphold keeps it removed; Restore clears the takedown and leaves the item
 * off (the owner publishes, unhides or relists it themselves). The member is told either way; reporters are not.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { useRefusalText } from '@/components/errors/useRefusalText';
import {
  decideRemovalReviewApi,
  listAdminRemovalReviewsApi,
  type AdminRemovalReview,
} from '@/lib/moderation/removal-reviews.contract';
import { reportKindLabel } from '@/components/feed/report-kind-label';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { relativeTimeShort } from '@/lib/utils';

const KEY = ['admin', 'removal-reviews'] as const;

export function RemovalReviewsPanel() {
  const { t } = useTranslation('removal-appeals');
  const refusalText = useRefusalText();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = useQuery({
    queryKey: [...KEY, 'pending'],
    retry: false,
    queryFn: () => api(listAdminRemovalReviewsApi, { query: { status: 'pending' } }),
  });
  const decided = useQuery({
    queryKey: [...KEY, 'decided'],
    retry: false,
    queryFn: () => api(listAdminRemovalReviewsApi, { query: { status: 'decided' } }),
  });
  const arrival = useArrival(!pending.isPending);

  const decide = async (id: string, action: 'uphold' | 'restore') => {
    setBusyId(id);
    try {
      await api(decideRemovalReviewApi, { params: { id }, body: { action } });
      toast.success(
        action === 'restore'
          ? t('admin-restored-toast', { defaultValue: 'Restored. The member was told.' })
          : t('admin-upheld-toast', { defaultValue: 'Removal upheld. The member was told.' }),
      );
    } catch (e) {
      toast.error(refusalText.maybe(e) ?? t('admin-failed', { defaultValue: 'Could not record the decision.' }));
    } finally {
      setBusyId(null);
      void qc.invalidateQueries({ queryKey: KEY });
    }
  };

  const kindOf = (r: AdminRemovalReview): string => reportKindLabel(t, r.kind);

  return (
    <div className="space-y-8">
      <section aria-labelledby="removal-reviews-waiting" className={arrival}>
        <h2 id="removal-reviews-waiting" className="t-heading text-site-text">
          {t('admin-waiting', { defaultValue: 'Waiting for a decision' })}
        </h2>
        {pending.isPending ? (
          <div className="space-y-3 pt-3" role="status" aria-label={t('admin-loading', { defaultValue: 'Loading' })}>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : pending.isError ? (
          <EmptyState
            title={t('admin-error', { defaultValue: 'Could not load the reviews.' })}
            action={
              <Button variant="default" onClick={() => void pending.refetch()}>
                {t('retry', { defaultValue: 'Try again' })}
              </Button>
            }
          />
        ) : pending.data.items.length === 0 ? (
          <EmptyState title={t('admin-empty', { defaultValue: 'No second looks are waiting.' })} />
        ) : (
          <ul className="divide-y divide-site-border">
            {pending.data.items.map((r) => (
              <li key={r.id} className="space-y-2 py-4">
                <p className="t-body break-words text-site-text">
                  {kindOf(r)}
                  {r.title ? (
                    <>
                      {': '}
                      <bdi>{r.title}</bdi>
                    </>
                  ) : null}
                </p>
                <p className="t-meta">
                  <bdi>{r.author.name || r.author.handle}</bdi>
                  {' · '}
                  {t('admin-removed', { defaultValue: 'removed' })}{' '}
                  <RelativeTime date={r.removedAt} format={relativeTimeShort} />
                  {' · '}
                  {t('admin-asked', { defaultValue: 'asked' })}{' '}
                  <RelativeTime date={r.reviewRequestedAt} format={relativeTimeShort} />
                </p>
                {r.reviewNote ? (
                  <p dir="auto" className="t-body whitespace-pre-wrap break-words border-s-2 border-site-border ps-3">
                    {r.reviewNote}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="default" disabled={busyId === r.id} onClick={() => void decide(r.id, 'restore')}>
                    {t('admin-restore', { defaultValue: 'Restore' })}
                  </Button>
                  <Button variant="default" disabled={busyId === r.id} onClick={() => void decide(r.id, 'uphold')}>
                    {t('admin-uphold', { defaultValue: 'Uphold removal' })}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.data && decided.data.items.length > 0 ? (
        <section aria-labelledby="removal-reviews-decided">
          <h2 id="removal-reviews-decided" className="t-heading text-site-text">
            {t('admin-decided', { defaultValue: 'Decided' })}
          </h2>
          <ul className="divide-y divide-site-border">
            {decided.data.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="t-body break-words text-site-text">
                    {kindOf(r)}
                    {r.title ? (
                      <>
                        {': '}
                        <bdi>{r.title}</bdi>
                      </>
                    ) : null}
                  </p>
                  <p className="t-meta">
                    <bdi>{r.author.name || r.author.handle}</bdi>
                    {r.reviewDecidedAt ? (
                      <>
                        {' · '}
                        <RelativeTime date={r.reviewDecidedAt} format={relativeTimeShort} />
                      </>
                    ) : null}
                  </p>
                </div>
                <p className="t-label text-site-text">
                  {r.outcome === 'restored'
                    ? t('admin-outcome-restored', { defaultValue: 'Restored' })
                    : t('admin-outcome-upheld', { defaultValue: 'Upheld' })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

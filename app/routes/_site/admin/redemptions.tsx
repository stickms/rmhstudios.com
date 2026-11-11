import { createFileRoute } from '@tanstack/react-router';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Coins, Gift, Package, Banknote } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { adminRedemptionsQuery } from '@/lib/admin/admin-ops.queries';

import { serverError } from '@/lib/http';
import { reviewRedemptionApi } from '@/lib/admin/admin-tools.contract';
export const Route = createFileRoute('/_site/admin/redemptions')({
  head: () => ({ meta: [{ title: 'Redemption Queue | RMH Studios' }] }),
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, adminRedemptionsQuery()),
  component: AdminRedemptionsPage,
});

interface RedemptionRow {
  id: string;
  kind: 'SUB_CREDIT' | 'MERCH' | 'PAYOUT';
  amountCoins: number;
  tierGranted: string | null;
  monthsGranted: number | null;
  note: string | null;
  createdAt: string;
  user: { id: string; name: string | null; handle: string | null };
}

const KIND_ICON = { SUB_CREDIT: Gift, MERCH: Package, PAYOUT: Banknote } as const;

function AdminRedemptionsPage() {
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();
  const query = adminRedemptionsQuery();
  // A failed read shows an empty queue.
  const { data, isPending: loading } = useQuery(query);
  const rows: RedemptionRow[] = data?.requests ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, action: 'approve' | 'reject' | 'fulfill') => {
    setBusyId(id);
    try {
      try {
        await api(reviewRedemptionApi, { params: { id }, body: { action } });
      } catch (error) {
        toast.error(
          serverError(error) ?? t('action-failed-appeals', { defaultValue: 'Action failed' }),
        );
        return;
      }
      toast.success(
        action === 'reject'
          ? t('rejected', { defaultValue: 'Declined and refunded' })
          : t('done', { defaultValue: 'Done' }),
      );
      queryClient.setQueryData(query.queryKey, (old) =>
        old ? { requests: old.requests.filter((r) => r.id !== id) } : old,
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageLayout
      title={t('redemptions-title', { defaultValue: 'Redemption Queue' })}
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
      wide
    >
      <AdminBody width="narrow">
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Coins}
            title={t('redemptions-empty', { defaultValue: 'No pending redemption requests.' })}
          />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <div key={r.id} className="glass-fill space-y-3 rounded-site p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="size-5 shrink-0 text-site-accent" aria-hidden />
                      <div className="min-w-0">
                        <div className="truncate text-base font-medium text-site-text">
                          {r.kind === 'SUB_CREDIT'
                            ? t('sub-summary', {
                                defaultValue: '{{months}} months of {{tier}}',
                                months: r.monthsGranted ?? 1,
                                tier: r.tierGranted ?? '',
                              })
                            : r.kind === 'MERCH'
                              ? t('merch', { defaultValue: 'Merch redemption' })
                              : t('payout', { defaultValue: 'Cash payout' })}
                        </div>
                        <div className="text-sm text-site-text-muted">
                          @{r.user.handle ?? r.user.name ?? r.user.id.slice(0, 6)}
                          {' · '}
                          {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      icon={<Coins className="text-site-warning" aria-hidden />}
                    >
                      {r.amountCoins}
                    </Badge>
                  </div>
                  {r.note && (
                    <p className="border-l-2 border-site-border pl-3 text-sm text-site-text-muted">
                      {r.note}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => act(r.id, r.kind === 'SUB_CREDIT' ? 'approve' : 'fulfill')}
                      loading={busyId === r.id}
                    >
                      {r.kind === 'SUB_CREDIT'
                        ? t('grant', { defaultValue: 'Grant credit' })
                        : t('fulfill', { defaultValue: 'Mark fulfilled' })}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => act(r.id, 'reject')}
                      loading={busyId === r.id}
                    >
                      {t('decline', { defaultValue: 'Decline & refund' })}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminBody>
    </PageLayout>
  );
}

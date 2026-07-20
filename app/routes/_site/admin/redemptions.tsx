import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Coins, Gift, Package, Banknote } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/redemptions')({
  head: () => ({ meta: [{ title: 'Redemption Queue | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
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
  const [rows, setRows] = useState<RedemptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/redemptions', { credentials: 'include' });
      const data = await res.json().catch(() => ({ requests: [] }));
      setRows(res.ok ? (data.requests ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: 'approve' | 'reject' | 'fulfill') => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/redemptions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('action-failed', { defaultValue: 'Action failed' }));
        return;
      }
      toast.success(
        action === 'reject'
          ? t('rejected', { defaultValue: 'Declined and refunded' })
          : t('done', { defaultValue: 'Done' }),
      );
      setRows((prev) => prev.filter((r) => r.id !== id));
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
      <div className="mx-auto w-full max-w-2xl p-4 md:p-8">
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
              <Card key={r.id} className="p-4 space-y-3" pane>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="size-5 text-site-accent shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
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
                      <div className="text-sm text-site-text-dim">
                        @{r.user.handle ?? r.user.name ?? r.user.id.slice(0, 6)}
                        {' · '}
                        {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    <span className="flex items-center gap-1">
                      <Coins className="size-3 text-site-warning" />
                      {r.amountCoins}
                    </span>
                  </Badge>
                </div>
                {r.note && (
                  <p className="text-sm text-site-text-dim border-l-2 border-site-border pl-2">
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
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </PageLayout>
  );
}

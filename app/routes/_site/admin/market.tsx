import { createFileRoute } from '@tanstack/react-router';
import { AdminBody } from '@/components/admin/AdminBody';
import { PageLayout } from '@/components/feed/PageLayout';
import { useEffect, useState, useCallback } from 'react';
import { Coins, Store } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { listAdminHeldListingsApi, resolveAdminHeldListingApi } from '@/lib/admin/admin-ops.contract';

export const Route = createFileRoute('/_site/admin/market')({
  head: () => ({ meta: [{ title: 'Marketplace Review | RMH Studios' }] }),
  component: AdminMarketPage,
});

/** Mirrors `HeldListing` in lib/market/market.server.ts (server-only module). */
interface HeldListingRow {
  id: string;
  itemId: string;
  priceCoins: number;
  createdAt: string;
  item: { id: string; name: string; kind: string; rarity: string } | null;
  seller: { id: string; name: string | null; handle: string | null };
  medianCoins: number | null;
  recentSales: number;
}

type Action = 'release' | 'cancel';

/**
 * Marketplace listings frozen as HELD: a buy at ≥10× the item's 30-day median
 * stopped before any coins moved. Release puts the listing back on sale at the
 * reviewed price (the frozen buy is not replayed); cancel closes it and returns
 * the item to the seller.
 */
function AdminMarketPage() {
  const { t, i18n } = useTranslation('admin');
  const [rows, setRows] = useState<HeldListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  // One request at a time across the whole queue: every action button is
  // disabled while any is in flight.
  const [busy, setBusy] = useState<{ id: string; action: Action } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(listAdminHeldListingsApi, { retries: 0 });
      setRows(data.listings ?? []);
    } catch (e) {
      toast.error(
        serverError(e) ??
          t('market-review-load-failed', { defaultValue: "Couldn't load held listings" }),
      );
      // An HTTP refusal empties the list; a network failure leaves it as it was.
      if (e instanceof HttpError) setRows([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: Action) => {
    if (busy) return;
    setBusy({ id, action });
    try {
      try {
        await api(resolveAdminHeldListingApi, { params: { id }, body: { action } });
      } catch (e) {
        toast.error(serverError(e) ?? t('action-failed-appeals', { defaultValue: 'Action failed' }));
        // 409: someone else resolved it (or the seller cancelled) — drop it.
        if (e instanceof HttpError && e.status === 409) {
          setRows((prev) => prev.filter((r) => r.id !== id));
        }
        return;
      }
      toast.success(
        action === 'release'
          ? t('market-review-released', { defaultValue: 'Listing is back on sale' })
          : t('market-review-canceled', { defaultValue: 'Listing canceled, item returned' }),
      );
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast.error(t('action-failed-appeals', { defaultValue: 'Action failed' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <PageLayout
      title={t('market-review-title', { defaultValue: 'Marketplace Review' })}
      description={t('market-review-description', {
        defaultValue:
          'Listings held after a buy at 10× or more of the 30-day median price. No coins moved.',
      })}
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
            icon={Store}
            title={t('market-review-empty', { defaultValue: 'No listings are held for review.' })}
          />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const name = r.item?.name ?? r.itemId;
              return (
                <div key={r.id} className="glass-fill space-y-3 rounded-site p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium text-site-text">{name}</div>
                      <div className="text-sm text-site-text-muted">
                        @{r.seller.handle ?? r.seller.name ?? r.seller.id.slice(0, 6)}
                        {' · '}
                        {t('market-review-listed', {
                          defaultValue: 'listed {{when}}',
                          when: formatRelativeTime(r.createdAt, i18n.language),
                        })}
                      </div>
                    </div>
                    <Badge
                      variant="default"
                      icon={<Coins className="text-site-warning" aria-hidden />}
                    >
                      {r.priceCoins.toLocaleString()}
                    </Badge>
                  </div>
                  <p className="font-mono text-sm text-site-text-muted">
                    {r.medianCoins == null
                      ? t('market-review-no-median', {
                          defaultValue: 'No sales of this item in the last 30 days',
                        })
                      : t('market-review-median', {
                          defaultValue: '30-day median {{median}} coins over {{sales}} sales',
                          median: Math.round(r.medianCoins).toLocaleString(),
                          sales: r.recentSales,
                        })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => act(r.id, 'release')}
                      disabled={busy !== null}
                      loading={busy?.id === r.id && busy.action === 'release'}
                    >
                      {t('market-review-release', { defaultValue: 'Release to sale' })}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => act(r.id, 'cancel')}
                      disabled={busy !== null}
                      loading={busy?.id === r.id && busy.action === 'cancel'}
                    >
                      {t('market-review-cancel', { defaultValue: 'Cancel listing' })}
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

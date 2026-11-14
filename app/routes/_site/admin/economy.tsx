/**
 * Coin supply dashboard. Admin only.
 *
 * The economy has many faucets (quests, streaks, wheel, achievements, casino
 * payouts) and comparatively few sinks, and nothing measured the difference —
 * so nobody could answer whether coins were being created faster than they were
 * destroyed. That question is the whole page: `sinkRatio` is the number to
 * watch, and everything else is context for it.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import type { TabItem } from '@/components/ui/tabs';
import { PageTabs } from '@/components/feed/PageTabs';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { AdminBody } from '@/components/admin/AdminBody';
import { StatGrid, StatTile } from '@/components/admin/StatTile';
import { AdminScroll, AdminSection } from '@/components/admin/AdminRows';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { adminEconomyQuery } from '@/lib/admin/admin-ops.queries';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_site/admin/economy')({
  head: () => ({ meta: [{ title: 'Coin Economy | RMH Studios' }] }),
  // The default window; another tab fetches its own on the client.
  loader: ({ context }) => prefetchRouteQuery(context.queryClient, adminEconomyQuery('30')),
  component: AdminEconomyPage,
});

interface FlowByType {
  type: string;
  faucet: number;
  sink: number;
  transfer: number;
}

interface Snapshot {
  windowDays: number;
  faucet: number;
  sink: number;
  transfer: number;
  netIssuance: number;
  sinkRatio: number;
  totalFloat: number;
  holders: number;
  meanBalance: number;
  top1PctShare: number;
  byType: FlowByType[];
  negativeBalances: number;
}

const WINDOWS = ['7', '30', '90'] as const;

const nf = new Intl.NumberFormat('en-US');

function AdminEconomyPage() {
  const { t } = useTranslation('admin');
  const [days, setDays] = useState<string>('30');
  // The response is `{ snapshot, flows, shape }`; the page reads the snapshot.
  const { data: res, isPending: loading } = useQuery(adminEconomyQuery(days));
  const data: Snapshot | null = res?.snapshot ?? null;
  const arrival = useArrival(!loading);

  const tabs: TabItem[] = WINDOWS.map((w) => ({
    id: w,
    label: t('economy-window-days', { defaultValue: '{{count}} days', count: Number(w) }),
  }));

  // Below 1 means more coins are destroyed than created — a shrinking supply.
  // Sustained values well under 1 are the inflation signal.
  const ratio = data ? data.sinkRatio : 0;
  const ratioTone = ratio >= 0.8 ? 'good' : ratio >= 0.4 ? undefined : 'bad';

  return (
    <PageLayout
      title={t('economy-title', { defaultValue: 'Coin Economy' })}
      description={t('economy-description', {
        defaultValue:
          'Coins created versus destroyed. If faucets outrun sinks for long, prices drift and the shop stops being a goal.',
      })}
      wide
      backTo="/admin"
    >
      <PageTabs
        tabs={tabs}
        value={days}
        onChange={setDays}
        aria-label={t('economy-window', { defaultValue: 'Time window' })}
      />
      <AdminBody>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !data ? (
          <EmptyState
            className={arrival}
            icon={Coins}
            title={t('economy-unavailable', { defaultValue: 'Could not load economy data.' })}
          />
        ) : (
          <div className={cn('space-y-[var(--site-section-gap)]', arrival)}>
            {data.negativeBalances > 0 && (
              <div
                role="alert"
                className="flex items-start gap-3 border-y border-site-danger py-3"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-site-danger" aria-hidden />
                <div>
                  <p className="t-body font-semibold text-site-danger">
                    {t('economy-negative-title', {
                      defaultValue: '{{count}} accounts have a negative balance',
                      count: data.negativeBalances,
                    })}
                  </p>
                  <p className="mt-1 t-body text-site-text">
                    {t('economy-negative-body', {
                      defaultValue:
                        'This should be impossible — a debit path is bypassing the ledger. Every spend must go through lib/economy/ledger.server.ts.',
                    })}
                  </p>
                </div>
              </div>
            )}

            <StatGrid>
              <StatTile
                label={t('economy-faucet', { defaultValue: 'Created' })}
                value={nf.format(data.faucet)}
                hint={t('economy-faucet-hint', { defaultValue: 'rewards, payouts, refunds' })}
              />
              <StatTile
                label={t('economy-sink', { defaultValue: 'Destroyed' })}
                value={nf.format(data.sink)}
                hint={t('economy-sink-hint', { defaultValue: 'purchases, unlocks, fees' })}
              />
              <StatTile
                label={t('economy-net', { defaultValue: 'Net issuance' })}
                value={`${data.netIssuance >= 0 ? '+' : ''}${nf.format(data.netIssuance)}`}
                tone={data.netIssuance > 0 ? 'bad' : 'good'}
                hint={t('economy-net-hint', { defaultValue: 'positive = supply growing' })}
              />
              <StatTile
                label={t('economy-ratio', { defaultValue: 'Sink ratio' })}
                value={`${Math.round(ratio * 100)}%`}
                tone={ratioTone}
                hint={t('economy-ratio-hint', { defaultValue: 'destroyed ÷ created' })}
              />
              <StatTile
                label={t('economy-float', { defaultValue: 'Total float' })}
                value={nf.format(data.totalFloat)}
              />
              <StatTile
                label={t('economy-holders', { defaultValue: 'Holders' })}
                value={nf.format(data.holders)}
              />
              <StatTile
                label={t('economy-mean', { defaultValue: 'Mean balance' })}
                value={nf.format(data.meanBalance)}
              />
              <StatTile
                label={t('economy-top1', { defaultValue: 'Top 1% share' })}
                value={`${Math.round(data.top1PctShare * 100)}%`}
              />
            </StatGrid>

            <AdminSection title={t('economy-by-type', { defaultValue: 'Flow by transaction type' })}>
              {data.byType.length === 0 ? (
                <p className="t-body text-site-text-muted">
                  {t('economy-no-flow', { defaultValue: 'No coin movement in this window.' })}
                </p>
              ) : (
                <AdminScroll>
                  <table className="t-body w-full">
                    <thead>
                      <tr className="t-label text-start">
                        <th scope="col" className="pb-2 text-start">
                          {t('economy-col-type', { defaultValue: 'Type' })}
                        </th>
                        <th scope="col" className="pb-2 text-end">
                          {t('economy-col-created', { defaultValue: 'Created' })}
                        </th>
                        <th scope="col" className="pb-2 text-end">
                          {t('economy-col-destroyed', { defaultValue: 'Destroyed' })}
                        </th>
                        <th scope="col" className="pb-2 text-end">
                          {t('economy-col-moved', { defaultValue: 'Moved' })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byType.map((row) => (
                        <tr key={row.type} className="border-t border-site-border">
                          <td className="py-3">
                            <Badge variant="default">
                              {row.type}
                            </Badge>
                          </td>
                          <td className="py-3 text-end tabular-nums text-site-text">
                            {row.faucet > 0 && (
                              <TrendingUp
                                className="mr-1 inline size-3 text-site-warning"
                                aria-hidden
                              />
                            )}
                            {nf.format(row.faucet)}
                          </td>
                          <td className="py-3 text-end tabular-nums text-site-text">
                            {row.sink > 0 && (
                              <TrendingDown
                                className="mr-1 inline size-3 text-site-success"
                                aria-hidden
                              />
                            )}
                            {nf.format(row.sink)}
                          </td>
                          <td className="py-3 text-end tabular-nums text-site-text-muted">
                            {nf.format(row.transfer)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </AdminScroll>
              )}
            </AdminSection>
          </div>
        )}
      </AdminBody>
    </PageLayout>
  );
}

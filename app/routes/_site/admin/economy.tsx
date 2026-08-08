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
import { useCallback, useEffect, useState } from 'react';
import { Coins, TrendingUp, TrendingDown, Users, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export const Route = createFileRoute('/_site/admin/economy')({
  head: () => ({ meta: [{ title: 'Coin Economy | RMH Studios' }] }),
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

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
}) {
  const toneClass =
    tone === 'good' ? 'text-site-success' : tone === 'bad' ? 'text-site-danger' : 'text-site-text';
  return (
    <div className="rounded-site border border-site-border bg-site-surface/40 p-4">
      <p className="text-xs text-site-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-site-text-dim">{hint}</p>}
    </div>
  );
}

function AdminEconomyPage() {
  const { t } = useTranslation('admin');
  const [days, setDays] = useState<string>('30');
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/economy?days=${d}`, { credentials: 'include' });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const tabs: LiquidTab[] = WINDOWS.map((w) => ({
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
      wide
      backTo="/admin"
    >
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <div className="flex items-center gap-2 text-sm text-site-text-muted">
          <Coins className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />
          {t('economy-description', {
            defaultValue:
              'Coins created versus destroyed. If faucets outrun sinks for long, prices drift and the shop stops being a goal.',
          })}
        </div>

        <LiquidTabs
          tabs={tabs}
          value={days}
          onChange={setDays}
          aria-label={t('economy-window', { defaultValue: 'Time window' })}
        />

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !data ? (
          <EmptyState
            icon={Coins}
            title={t('economy-unavailable', { defaultValue: 'Could not load economy data.' })}
          />
        ) : (
          <>
            {data.negativeBalances > 0 && (
              <div className="flex items-start gap-3 rounded-site border border-site-danger/20 bg-site-danger/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-site-danger" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-site-danger">
                    {t('economy-negative-title', {
                      defaultValue: '{{count}} accounts have a negative balance',
                      count: data.negativeBalances,
                    })}
                  </p>
                  <p className="mt-1 text-sm text-site-text">
                    {t('economy-negative-body', {
                      defaultValue:
                        'This should be impossible — a debit path is bypassing the ledger. Every spend must go through lib/economy/ledger.server.ts.',
                    })}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label={t('economy-faucet', { defaultValue: 'Created' })}
                value={nf.format(data.faucet)}
                hint={t('economy-faucet-hint', { defaultValue: 'rewards, payouts, refunds' })}
              />
              <Stat
                label={t('economy-sink', { defaultValue: 'Destroyed' })}
                value={nf.format(data.sink)}
                hint={t('economy-sink-hint', { defaultValue: 'purchases, unlocks, fees' })}
              />
              <Stat
                label={t('economy-net', { defaultValue: 'Net issuance' })}
                value={`${data.netIssuance >= 0 ? '+' : ''}${nf.format(data.netIssuance)}`}
                tone={data.netIssuance > 0 ? 'bad' : 'good'}
                hint={t('economy-net-hint', { defaultValue: 'positive = supply growing' })}
              />
              <Stat
                label={t('economy-ratio', { defaultValue: 'Sink ratio' })}
                value={`${Math.round(ratio * 100)}%`}
                tone={ratioTone}
                hint={t('economy-ratio-hint', { defaultValue: 'destroyed ÷ created' })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat
                label={t('economy-float', { defaultValue: 'Total float' })}
                value={nf.format(data.totalFloat)}
              />
              <Stat
                label={t('economy-holders', { defaultValue: 'Holders' })}
                value={nf.format(data.holders)}
              />
              <Stat
                label={t('economy-mean', { defaultValue: 'Mean balance' })}
                value={nf.format(data.meanBalance)}
              />
              <Stat
                label={t('economy-top1', { defaultValue: 'Top 1% share' })}
                value={`${Math.round(data.top1PctShare * 100)}%`}
              />
            </div>

            <section className="rounded-site border border-site-border bg-site-surface/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-5 w-5 text-site-accent" aria-hidden />
                <h2 className="text-base font-bold text-site-text">
                  {t('economy-by-type', { defaultValue: 'Flow by transaction type' })}
                </h2>
              </div>
              {data.byType.length === 0 ? (
                <p className="text-sm text-site-text-muted">
                  {t('economy-no-flow', { defaultValue: 'No coin movement in this window.' })}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-site-text-muted">
                        <th className="pb-2 font-medium">
                          {t('economy-col-type', { defaultValue: 'Type' })}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t('economy-col-created', { defaultValue: 'Created' })}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t('economy-col-destroyed', { defaultValue: 'Destroyed' })}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t('economy-col-moved', { defaultValue: 'Moved' })}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byType.map((row) => (
                        <tr key={row.type} className="border-t border-site-border">
                          <td className="py-2">
                            <Badge variant="outline" size="sm">
                              {row.type}
                            </Badge>
                          </td>
                          <td className="py-2 text-right tabular-nums text-site-text">
                            {row.faucet > 0 && (
                              <TrendingUp
                                className="mr-1 inline h-3 w-3 text-site-warning"
                                aria-hidden
                              />
                            )}
                            {nf.format(row.faucet)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-site-text">
                            {row.sink > 0 && (
                              <TrendingDown
                                className="mr-1 inline h-3 w-3 text-site-success"
                                aria-hidden
                              />
                            )}
                            {nf.format(row.sink)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-site-text-muted">
                            {nf.format(row.transfer)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PageLayout>
  );
}

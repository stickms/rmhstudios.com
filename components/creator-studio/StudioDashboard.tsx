'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Users, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { timeAgoShort } from '@/lib/utils';
import { TierEditor } from '@/components/creator/TierEditor';
import type { StudioOverview } from '@/lib/creator/studio.server';

/**
 * StudioDashboard — the monetization dashboard that used to live at the
 * standalone `/creator-studio` ("Studio") route, now merged into the `/create`
 * Creator Studio Earnings tab. Fetches the caller's overview client-side, then
 * renders the headline stats, earnings-by-source breakdown, recent tips, and
 * (below) the membership tier editor.
 */
export function StudioDashboard() {
  const [overview, setOverview] = useState<StudioOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/creator/studio-overview');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setOverview(data.overview ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  // Signed-out / unavailable: hide the dashboard rather than spin forever. The
  // redemption form (EarningsTab) rendered below still shows its own state, and
  // the /create route (unlike the old /creator-studio page) isn't auth-gated.
  if (!overview) return null;

  return (
    <div className="space-y-6">
      <OverviewSection overview={overview} />
      <div className="max-w-2xl">
        <TierEditor initialTiers={overview?.tiers ?? []} />
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon?: typeof Coins;
}) {
  return (
    <Card className="p-4" pane>
      <div className="text-xs uppercase tracking-wide text-site-text-dim">{label}</div>
      <div className="text-2xl font-bold flex items-center gap-1.5 tabular-nums">
        {Icon ? <Icon className="size-5 text-yellow-500" aria-hidden /> : null}
        {value.toLocaleString()}
      </div>
    </Card>
  );
}

function OverviewSection({ overview }: { overview: StudioOverview | null }) {
  const { t } = useTranslation('site');

  if (!overview) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const { earnings, bySource, monthly, supporterCount, recentTips } = overview;
  const windowTotal = bySource.tips + bySource.memberships + bySource.sales;
  const maxMonth = Math.max(1, ...monthly.map((m) => m.total));

  const sources: { key: keyof typeof bySource; label: string; bar: string }[] = [
    { key: 'tips', label: t('tips', { defaultValue: 'Tips' }), bar: 'bg-site-accent' },
    {
      key: 'memberships',
      label: t('memberships', { defaultValue: 'Memberships' }),
      bar: 'bg-site-success',
    },
    { key: 'sales', label: t('sales', { defaultValue: 'Sales' }), bar: 'bg-site-warning' },
  ];

  return (
    <div className="space-y-6">
      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={t('supporters', { defaultValue: 'Supporters' })}
          value={supporterCount}
          icon={Users}
        />
        <StatTile
          label={t('redeemable', { defaultValue: 'Redeemable' })}
          value={earnings.redeemable}
          icon={Coins}
        />
        <StatTile
          label={t('lifetime-earned', { defaultValue: 'Lifetime earned' })}
          value={earnings.lifetimeEarned}
          icon={Sparkles}
        />
        <StatTile
          label={t('coin-balance', { defaultValue: 'Coin balance' })}
          value={earnings.spendable}
          icon={Coins}
        />
      </div>

      {/* Per-source split (window) */}
      <Card className="p-5 space-y-4" pane>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold text-site-text">
            {t('earnings-by-source', { defaultValue: 'Earnings by source' })}
          </h2>
          <span className="text-xs text-site-text-dim">
            {t('last-6-months', { defaultValue: 'Last 6 months' })}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {sources.map(({ key, label, bar }) => (
            <div key={key} className="glass-inset rounded-site px-3 py-3">
              <div className="flex items-center gap-1.5 text-xs text-site-text-dim">
                <span className={`inline-block size-2.5 rounded-full ${bar}`} aria-hidden />
                {label}
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums text-site-text">
                {bySource[key].toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Monthly breakdown as segmented bars */}
        {windowTotal > 0 ? (
          <div className="space-y-2 pt-1">
            {monthly.map((m) => {
              const [y, mo] = m.month.split('-');
              const monthLabel = new Date(Date.UTC(Number(y), Number(mo) - 1, 1)).toLocaleString(
                undefined,
                {
                  month: 'short',
                },
              );
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="w-9 shrink-0 text-xs text-site-text-dim tabular-nums">
                    {monthLabel}
                  </span>
                  <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-site-surface">
                    <div
                      className="flex h-full"
                      style={{ width: `${(m.total / maxMonth) * 100}%` }}
                    >
                      {sources.map(({ key, bar }) =>
                        m[key] > 0 ? (
                          <div
                            key={key}
                            className={bar}
                            style={{ width: `${m.total > 0 ? (m[key] / m.total) * 100 : 0}%` }}
                          />
                        ) : null,
                      )}
                    </div>
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-site-text-muted">
                    {m.total.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-site-text-dim">
            {t('no-earnings-window', { defaultValue: 'No earnings in this window yet.' })}
          </p>
        )}
      </Card>

      {/* Recent tips */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-site-text-dim">
          {t('recent-tips', { defaultValue: 'Recent tips' })}
        </h2>
        {recentTips.length === 0 ? (
          <p className="text-sm text-site-text-dim">
            {t('no-tips-yet', {
              defaultValue: 'No tips yet — supporters who tip will show up here.',
            })}
          </p>
        ) : (
          <div className="space-y-2">
            {recentTips.map((tip) => (
              <div
                key={tip.id}
                className="flex items-center justify-between gap-3 glass-fill rounded-site px-3 py-2.5"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-site-text">
                    {tip.sender?.name ?? t('someone', { defaultValue: 'Someone' })}
                  </span>
                  {tip.sender?.handle ? (
                    <span className="text-xs text-site-text-dim"> @{tip.sender.handle}</span>
                  ) : null}
                  {tip.note ? (
                    <p className="truncate text-xs text-site-text-muted">{tip.note}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-site-text">
                    <Coins className="size-4 text-yellow-500" aria-hidden />
                    {tip.amount.toLocaleString()}
                  </span>
                  <span className="text-xs text-site-text-dim">{timeAgoShort(tip.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

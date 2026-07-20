import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useTranslation } from 'react-i18next';
import { Coins, Users, Sparkles, LayoutDashboard, Layers, Heart } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { timeAgoShort } from '@/lib/utils';
import { useSession } from '@/components/Providers';
import { TierEditor } from '@/components/creator/TierEditor';
import { auth } from '@/lib/auth';
import { getStudioOverview } from '@/lib/creator/studio.server';
import type { StudioOverview } from '@/lib/creator/studio.server';

// Prefetch the caller's dashboard server-side (null when signed out — the page
// shows the sign-in prompt instead). Mirrors the achievements page pattern.
const fetchStudio = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ signedIn: boolean; overview: StudioOverview | null }> => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    if (!session) return { signedIn: false, overview: null };
    return { signedIn: true, overview: await getStudioOverview(session.user.id) };
  },
);

export const Route = createFileRoute('/_site/creator-studio')({
  head: () => ({ meta: [{ title: 'Studio | RMH Studios' }] }),
  loader: () => fetchStudio(),
  component: StudioPage,
});

type StudioTab = 'overview' | 'tiers';

function StudioPage() {
  const { t } = useTranslation('site');
  const { signedIn, overview } = Route.useLoaderData();
  const { data: session, isPending } = useSession();
  const [tab, setTab] = useState<StudioTab>('overview');

  const tabs: { id: StudioTab; label: string; icon: typeof LayoutDashboard }[] = [
    {
      id: 'overview',
      label: t('studio-overview', { defaultValue: 'Overview' }),
      icon: LayoutDashboard,
    },
    { id: 'tiers', label: t('studio-tiers', { defaultValue: 'Tiers' }), icon: Layers },
  ];

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <MobileTopBar title={t('studio', { defaultValue: 'Studio' })} />

        {!signedIn || (!session && !isPending) ? (
          <>
            <ColumnHeader icon={Heart} title={t('studio', { defaultValue: 'Studio' })} />
            {isPending ? (
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
                <p className="font-medium text-site-text">
                  {t('sign-in-for-studio', { defaultValue: 'Sign in to open your creator studio' })}
                </p>
                <Link to="/login" search={{ callbackURL: '/creator-studio' }}>
                  <Button variant="accent">{t('sign-in', { defaultValue: 'Sign in' })}</Button>
                </Link>
              </div>
            )}
          </>
        ) : (
          <>
            <header className="hidden md:flex items-center gap-2 px-6 py-4 border-b border-site-border">
              <Heart className="size-5 text-site-accent" aria-hidden />
              <h1 className="font-(family-name:--site-font-display) font-semibold text-2xl tracking-[-0.022em] text-site-text">
                {t('studio', { defaultValue: 'Studio' })}
              </h1>
            </header>

            <div
              role="tablist"
              aria-label={t('studio', { defaultValue: 'Studio' })}
              className="flex items-center gap-1 border-b border-site-border px-3"
            >
              {tabs.map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(id)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      active
                        ? 'border-site-accent text-site-text'
                        : 'border-transparent text-site-text-dim hover:text-site-text'
                    }`}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="px-4 sm:px-6 py-5">
              {tab === 'overview' ? (
                <OverviewSection overview={overview} />
              ) : (
                <div className="max-w-2xl">
                  <TierEditor initialTiers={overview?.tiers ?? []} />
                </div>
              )}
            </div>
          </>
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
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

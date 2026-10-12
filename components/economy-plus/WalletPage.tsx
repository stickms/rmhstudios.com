'use client';

/**
 * /wallet — the member's coin home (C1 goals, C4 statement, C5 community goals,
 * C7 gifts). The balance header is the only thing that renders eagerly; every
 * tab body is a lazy chunk fetched when that tab is opened.
 */
import { Suspense, lazy } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Flag, Gift, Receipt, Store, Target, TrendingUp, Wallet } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { useSession } from '@/components/Providers';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Button } from '@/components/ui/button';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import type { LiquidTab } from '@/components/ui/liquid-tabs';
import { apiJson } from './api';

export const WALLET_TABS = ['goals', 'statement', 'community', 'gifts'] as const;
export type WalletTab = (typeof WALLET_TABS)[number];

const SavingsGoalsPanel = lazy(() => import('./SavingsGoalsPanel'));
const StatementPanel = lazy(() => import('./StatementPanel'));
const CommunityGoalsPanel = lazy(() => import('./CommunityGoalsPanel'));
const ScheduledGiftsPanel = lazy(() => import('./ScheduledGiftsPanel'));

function PanelFallback() {
  return (
    <div className="space-y-3 px-3 pb-8">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

export function WalletPage({
  tab,
  onTabChange,
}: {
  tab: WalletTab;
  onTabChange: (tab: WalletTab) => void;
}) {
  const { t, i18n } = useTranslation('f-economy-plus');
  const { data: session, isPending } = useSession();
  const signedIn = !!session && !isPending;

  const { data: balance } = useQuery({
    queryKey: ['economy-plus', 'balance'],
    queryFn: () => apiJson<{ coins: number }>('/api/coins'),
    enabled: signedIn,
    staleTime: 15_000,
  });

  const tabs: LiquidTab[] = [
    { id: 'goals', label: t('wallet-tab-goals', { defaultValue: 'Goals' }), icon: Target },
    {
      id: 'statement',
      label: t('wallet-tab-statement', { defaultValue: 'Statement' }),
      icon: Receipt,
    },
    {
      id: 'community',
      label: t('wallet-tab-community', { defaultValue: 'Community' }),
      icon: Flag,
    },
    { id: 'gifts', label: t('wallet-tab-gifts', { defaultValue: 'Gifts' }), icon: Gift },
  ];

  return (
    <PageLayout
      title={t('wallet-title', { defaultValue: 'Wallet' })}
      description={t('wallet-subtitle', {
        defaultValue: 'Your coins, goals, monthly statements, community pots and gifts.',
      })}
    >
      {!signedIn ? (
        isPending ? (
          <PanelFallback />
        ) : (
          <SignedOutPrompt
            icon={Wallet}
            title={t('wallet-signed-out', { defaultValue: 'Sign in to open your wallet' })}
            callbackURL="/wallet"
          />
        )
      ) : (
        <>
          <div className="glass-pane mx-3 flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-xs text-site-text-muted">
                {t('wallet-balance', { defaultValue: 'Balance' })}
              </p>
              <p className="mt-0.5 flex items-center gap-2 text-2xl font-semibold tabular-nums text-site-text">
                <CoinIcon className="size-6" />
                {balance ? balance.coins.toLocaleString(i18n.language) : '—'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/store" search={{ tab: 'daily' }}>
                  <Store /> {t('wallet-link-store', { defaultValue: 'Store' })}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/predictions">
                  <TrendingUp /> {t('wallet-link-play', { defaultValue: 'Play & predict' })}
                </Link>
              </Button>
            </div>
          </div>

          <PageTabs
            tabs={tabs}
            value={tab}
            onChange={(id) => onTabChange(id as WalletTab)}
            idBase="wallet"
            aria-label={t('wallet-title', { defaultValue: 'Wallet' })}
          />

          <div role="tabpanel" id={`wallet-panel-${tab}`} aria-labelledby={`wallet-tab-${tab}`}>
            <Suspense fallback={<PanelFallback />}>
              {tab === 'goals' && <SavingsGoalsPanel />}
              {tab === 'statement' && <StatementPanel />}
              {tab === 'community' && <CommunityGoalsPanel />}
              {tab === 'gifts' && <ScheduledGiftsPanel />}
            </Suspense>
          </div>
        </>
      )}
    </PageLayout>
  );
}

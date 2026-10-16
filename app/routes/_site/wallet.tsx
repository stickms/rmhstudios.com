/**
 * /wallet — the member's coin home: savings goals, monthly statement, community
 * goal pots and scheduled gifts.
 *
 * It used to be a permanent redirect to /predictions (the wallet was renamed
 * "Predictions" and kept the old URL alive). Every link that says "wallet" —
 * search, the home widget, onboarding and referral notifications — still points
 * here, so this is a real page again; the markets and casino stay at
 * /predictions, linked from the balance header.
 */
import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { WalletPage } from '@/components/economy-plus/WalletPage';
import { WALLET_TABS, type WalletTab } from '@/lib/economy/wallet-tabs';

export const Route = createFileRoute('/_site/wallet')({
  head: definePage({
    path: '/wallet',
    title: 'Wallet | RMH Studios',
    description: 'Your RMH Coins: savings goals, monthly statements, community goals and gifts.',
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: WalletTab } => ({
    ...(WALLET_TABS.includes(search.tab as WalletTab) ? { tab: search.tab as WalletTab } : {}),
  }),
  component: Wallet,
});

function Wallet() {
  const { tab = 'goals' } = Route.useSearch();
  const navigate = useNavigate();
  const onTabChange = useCallback(
    (next: WalletTab) => {
      void navigate({ to: '/wallet', search: { tab: next }, replace: true });
    },
    [navigate],
  );
  return <WalletPage tab={tab} onTabChange={onTabChange} />;
}

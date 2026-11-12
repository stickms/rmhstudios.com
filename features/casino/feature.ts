import { defineFeature } from '@/lib/core/feature';

/**
 * The casino: Blackjack, Texas Hold'em, Baccarat and Roulette tables staked with RMHCoins. They have no page
 * of their own; the RMHCoins hub (`/predictions`, `components/rmhcoins/PlayTab.tsx`) lazy-loads them, so the
 * manifest is `listed: false`.
 *
 * Stays outside the feature on purpose: the coin ledger (`lib/economy`), the coins hub UI (`components/rmhcoins`:
 * CoinIcon, TableInvite, BettingCountdown, Plinko and the other tabs) and the HTTP-only Plinko. Economy is
 * platform, not casino. Cross-feature edges: none.
 *
 * `server/index.ts` also owns the refund-on-shutdown contract (`server/casino-shutdown.ts`): the hub's
 * `shutdown()` runs `CASINO_SHUTDOWN_REFUNDS` in order before `io.close()`.
 */
export default defineFeature({
  id: 'casino',
  kind: 'game',
  basePath: '/predictions',
  delivery: 'shell',
  routes: ['lib/api/routes/casino.rooms.server.ts'],
  namespaces: ['c-rmhcoins'],
  listed: false,
});

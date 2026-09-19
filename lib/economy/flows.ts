/**
 * Every way a coin enters or leaves the economy (W7).
 *
 * `supply.server.ts` answers "what happened" by aggregating the ledger, which
 * needs a database and a populated one. This file answers the other half —
 * **what CAN happen** — from the source, which is the half you need before
 * adding a new faucet, and the half W3 (venture stakes) must not be built
 * without. Issuing a speculative instrument against an economy whose issuance
 * nobody has enumerated is the one mistake in that plan that cannot be shipped
 * and then fixed.
 *
 * ## The three shapes, and why only two of them matter
 *
 * The ledger's sign convention (see `CoinTransaction` in the schema):
 *
 *   FAUCET    senderId = null                   supply grows
 *   SINK      recipientId = null                supply shrinks
 *   TRANSFER  both set                          supply unchanged
 *
 * A transfer cannot move the total by definition, so inflation is decided
 * entirely by the faucets and sinks below. Transfers are still listed, because
 * a transfer with a `fee` destroys the fee and is therefore a sink wearing a
 * transfer's clothes, and because "where does the money go" is a different and
 * also useful question.
 *
 * ## Bounded vs unbounded
 *
 * The field that matters most here. A **bounded** faucet has a ceiling that
 * does not move with how much a member plays: a daily claim, a one-time
 * achievement, a battle pass with a fixed number of tiers. An **unbounded**
 * faucet pays out in proportion to activity, so its lifetime issuance has no
 * limit — every casino payout, every wager settlement, every prediction
 * resolution.
 *
 * Unbounded does not mean wrong. Every one of them here is matched by a debit
 * on the way in, and the house edge or rake means the pair is net-negative.
 * It means the pair has to be read together, which is exactly the mistake a
 * dashboard counting gross faucet volume invites.
 *
 * ## Keeping this honest
 *
 * `lib/__tests__/economy-flows.test.ts` reads every `creditCoins*`,
 * `debitCoins*` and `transferCoins*` call site out of the tree and holds this
 * list to it. A new faucet that is not registered here fails the build, which
 * is the point: the failure mode this file exists to prevent is a coin source
 * that nobody remembered when they asked why the economy inflated.
 */

/** Which direction a flow moves the total supply. */
export type FlowKind = 'faucet' | 'sink' | 'transfer';

export interface CoinFlow {
  /** Stable id, also the sort key within a kind. */
  id: string;
  kind: FlowKind;
  /** Where a member triggers it, in words they would recognise. */
  surface: string;
  /** The file that holds the ledger call. */
  source: string;
  /**
   * Whether lifetime issuance has a ceiling that does not move with play.
   * Sinks record it too: a bounded sink cannot absorb a growing float.
   */
  bounded: boolean;
  /** What it is, and anything load-bearing about the amount. */
  note: string;
  /**
   * For an unbounded faucet: the sink id that takes coins on the way in, so the
   * pair can be read together. An unbounded faucet with no `pairsWith` is
   * making NEW supply out of activity — which is sometimes right (staking pays
   * a yield; an admin grant is discretionary) and always worth being a
   * deliberate, named decision rather than an oversight. The test requires one
   * or the other.
   */
  pairsWith?: string;
}

export const COIN_FLOWS: readonly CoinFlow[] = [
  // ── Faucets ───────────────────────────────────────────────────────────────
  {
    id: 'signup-grant',
    kind: 'faucet',
    surface: 'Creating an account',
    source: 'lib/economy/ledger-core.ts',
    bounded: true,
    note: 'STARTING_BALANCE, once per profile row.',
  },
  {
    id: 'daily-claim',
    kind: 'faucet',
    surface: 'The "out of coins" safety net',
    source: 'app/routes/api/coins/claim.ts',
    bounded: true,
    note: 'Guarded by onlyIfBalanceBelow, so it cannot pay a member who is already flush.',
  },
  {
    id: 'daily-wheel',
    kind: 'faucet',
    surface: '/wallet — the daily spin',
    source: 'app/routes/api/wheel/spin.ts',
    bounded: true,
    note: 'One spin per UTC day (DailyWheelSpin). Bounded per day, unbounded over a lifetime.',
  },
  {
    id: 'streak-reward',
    kind: 'faucet',
    surface: 'Keeping a daily streak',
    source: 'lib/streak.server.ts',
    bounded: true,
    note: 'Once per day, scaling with streak length.',
  },
  {
    id: 'quest-reward',
    kind: 'faucet',
    surface: 'Completing a quest',
    source: 'lib/quests/engine.server.ts',
    bounded: true,
    note: 'Fixed coins per quest definition; the quest set is finite per cycle.',
  },
  {
    id: 'achievement-reward',
    kind: 'faucet',
    surface: 'Earning an achievement',
    source: 'lib/achievements/engine.server.ts',
    bounded: true,
    note: 'Once per achievement per member — the most strictly bounded faucet here.',
  },
  {
    id: 'battlepass-claim',
    kind: 'faucet',
    surface: 'Claiming a season tier',
    source: 'app/routes/api/battlepass/claim.ts',
    bounded: true,
    note: 'Fixed tiers per season.',
  },
  {
    id: 'music-guess-reward',
    kind: 'faucet',
    surface: 'RMHMusic — the daily guess',
    source: 'app/routes/api/rmhmusic/guess/$id/attempt.ts',
    bounded: true,
    note: 'One puzzle per day.',
  },
  {
    id: 'creator-earnings-payout',
    kind: 'faucet',
    surface: 'Creator earnings withdrawal',
    source: 'lib/creator/earnings.server.ts',
    bounded: false,
    note: 'Pays out an earnings balance accrued from transfers; the matching debit is elsewhere.',
  },
  {
    id: 'prediction-payout',
    kind: 'faucet',
    surface: '/predictions — a resolved market',
    source: 'lib/predictions/predictions.server.ts',
    bounded: false,
    note: 'Paired with the WAGER debit that opened the position. Read the pair, not the leg.',
    pairsWith: 'prediction-stake',
  },
  {
    id: 'prediction-bot-grant',
    kind: 'faucet',
    surface: 'Synthetic market-makers',
    source: 'lib/predictions/predictions-ai.server.ts',
    bounded: false,
    note: 'Tops up bot accounts by 50. Coins held by bots are float that no member can spend.',
  },
  {
    id: 'wager-settlement',
    kind: 'faucet',
    surface: '/wager — a settled match',
    source: 'lib/wager/wager.server.ts',
    bounded: false,
    note: 'Payouts and stake refunds. Net-negative against the stakes by WAGER_RAKE_BPS.',
    pairsWith: 'wager-stake',
  },
  {
    id: 'tournament-settlement',
    kind: 'faucet',
    surface: 'Tournaments — prizes and refunds',
    source: 'lib/tournaments/tournament.server.ts',
    bounded: false,
    note: 'Net-negative against entry fees by TOURNAMENT_RAKE_BPS.',
    pairsWith: 'tournament-entry',
  },
  {
    id: 'pool-settlement',
    kind: 'faucet',
    surface: 'A funding pool settling or refunding',
    source: 'lib/commerce/pools.server.ts',
    bounded: false,
    note: 'Returns what was contributed; supply-neutral across the pair.',
    pairsWith: 'pool-contribution',
  },
  {
    id: 'staking-payout',
    kind: 'faucet',
    surface: '/wallet — a matured stake',
    source: 'lib/staking/staking.server.ts',
    bounded: false,
    note: 'Principal plus yield. The yield is genuinely new supply and the only pure-yield faucet here.',
  },
  {
    id: 'casino-payout',
    kind: 'faucet',
    surface: 'Blackjack, roulette, baccarat, hold\'em, plinko',
    source: 'server/socket-server/handlers/*.ts, app/routes/api/coins/bet.ts',
    bounded: false,
    note: 'Paired with the WAGER debit of the stake. Net-negative by the house edge of each game.',
    pairsWith: 'casino-stake',
  },
  {
    id: 'admin-grant',
    kind: 'faucet',
    surface: 'Admin adjustment',
    source: 'lib/coins.server.ts',
    bounded: false,
    note: 'Discretionary. The only faucet with no rule behind it, which is why it is typed ADMIN.',
  },

  // ── Sinks ─────────────────────────────────────────────────────────────────
  {
    id: 'shop-purchase',
    kind: 'sink',
    surface: '/shop',
    source: 'app/routes/api/shop/purchase.ts',
    bounded: false,
    note: 'The primary intended sink: cosmetics and inventory bought from the house.',
  },
  {
    id: 'coin-purchase',
    kind: 'sink',
    surface: 'In-app unlocks',
    source: 'app/routes/api/coins/purchase.ts',
    bounded: false,
    note: 'Priced unlocks charged against the house rather than another member.',
  },
  {
    id: 'battlepass-unlock',
    kind: 'sink',
    surface: 'Buying into a season',
    source: 'app/routes/api/battlepass/unlock.ts',
    bounded: true,
    note: 'Once per season.',
  },
  {
    id: 'streak-freeze',
    kind: 'sink',
    surface: 'Freezing a streak',
    source: 'lib/streak.server.ts',
    bounded: false,
    note: 'FREEZE_COST per use.',
  },
  {
    id: 'gift-membership',
    kind: 'sink',
    surface: 'Gifting a membership',
    source: 'lib/gifting/gift.server.ts',
    bounded: false,
    note: 'Coins are destroyed; the membership is granted out of band.',
  },
  {
    id: 'creator-earnings-spend',
    kind: 'sink',
    surface: 'Creator tooling paid for in coins',
    source: 'lib/creator/earnings.server.ts',
    bounded: false,
    note: 'Charged against the house.',
  },
  {
    id: 'pool-contribution',
    kind: 'sink',
    surface: 'Contributing to a pool',
    source: 'lib/commerce/pools.server.ts',
    bounded: false,
    note: 'Held until the pool settles or refunds — escrow, not destruction, across the pair.',
  },
  {
    id: 'staking-principal',
    kind: 'sink',
    surface: 'Opening a stake',
    source: 'lib/staking/staking.server.ts',
    bounded: false,
    note: 'Escrow. Booked REWARD rather than WAGER: a time deposit is not a bet, and W8 deliberately does not gate it.',
  },
  {
    id: 'prediction-stake',
    kind: 'sink',
    surface: '/predictions — opening a position',
    source: 'lib/predictions/predictions.server.ts',
    bounded: false,
    note: 'WAGER. Gated by the responsible-play check (W8).',
  },
  {
    id: 'wager-stake',
    kind: 'sink',
    surface: '/wager — staking a match',
    source: 'lib/wager/wager.server.ts',
    bounded: false,
    note: 'WAGER, via escrow. Gated by W8.',
  },
  {
    id: 'tournament-entry',
    kind: 'sink',
    surface: 'Tournament entry fee and seed pool',
    source: 'lib/tournaments/tournament.server.ts',
    bounded: false,
    note: 'WAGER. Gated by W8.',
  },
  {
    id: 'casino-stake',
    kind: 'sink',
    surface: 'Every table stake and side bet',
    source: 'server/socket-server/handlers/*.ts, app/routes/api/coins/bet.ts',
    bounded: false,
    note: 'WAGER. Gated by W8 — the single check that covers all five tables plus plinko.',
  },

  // ── Transfers (supply-neutral; fees inside them are sinks) ────────────────
  {
    id: 'tip',
    kind: 'transfer',
    surface: 'Tipping a post or a creator',
    source: 'app/routes/api/coins/tip.ts',
    bounded: false,
    note: 'Member to member.',
  },
  {
    id: 'coin-gift',
    kind: 'transfer',
    surface: 'Sending coins to someone',
    source: 'lib/gifting/coin-gift.server.ts',
    bounded: false,
    note: 'Member to member.',
  },
  {
    id: 'post-unlock',
    kind: 'transfer',
    surface: 'Unlocking a paywalled post',
    source: 'app/routes/api/rmharks/$id/unlock.ts',
    bounded: false,
    note: 'Buyer to author.',
  },
  {
    id: 'build-unlock',
    kind: 'transfer',
    surface: 'Unlocking a paid User Build',
    source: 'app/routes/api/user-builds/$id/unlock.ts',
    bounded: false,
    note: 'Buyer to author. The seam B3 (a build store with revenue share) builds on.',
  },
  {
    id: 'award',
    kind: 'transfer',
    surface: 'Giving an award',
    source: 'lib/awards/awards.server.ts',
    bounded: false,
    note: 'Giver to recipient.',
  },
  {
    id: 'creator-tier',
    kind: 'transfer',
    surface: 'Subscribing to a creator tier',
    source: 'lib/creator/tiers.server.ts, lib/memberships.server.ts',
    bounded: false,
    note: 'Supporter to creator.',
  },
  {
    id: 'market-sale',
    kind: 'transfer',
    surface: 'The player marketplace',
    source: 'lib/market/market.server.ts',
    bounded: false,
    note: 'Buyer to seller, minus a fee that IS destroyed.',
  },
  {
    id: 'storefront-sale',
    kind: 'transfer',
    surface: 'A creator storefront',
    source: 'lib/storefront/storefront.server.ts',
    bounded: false,
    note: 'Buyer to creator, minus a fee.',
  },
  {
    id: 'theme-sale',
    kind: 'transfer',
    surface: 'Buying a community theme',
    source: 'lib/themes/themes.server.ts',
    bounded: false,
    note: 'Buyer to author.',
  },
] as const;

/** Flows of one kind, in declaration order. */
export function flowsOfKind(kind: FlowKind): readonly CoinFlow[] {
  return COIN_FLOWS.filter((f) => f.kind === kind);
}

/**
 * The headline the audit exists to produce: how many ways coins can be created
 * without a ceiling, against how many ways they can be destroyed.
 *
 * Not a verdict on its own — an unbounded faucet paired with a larger sink is
 * healthy, and most of these are. It is the shape of the question, and it is
 * the number to re-read before adding another one.
 */
export function supplyShape(): {
  faucets: number;
  unboundedFaucets: number;
  sinks: number;
  unboundedSinks: number;
  transfers: number;
} {
  const f = flowsOfKind('faucet');
  const s = flowsOfKind('sink');
  return {
    faucets: f.length,
    unboundedFaucets: f.filter((x) => !x.bounded).length,
    sinks: s.length,
    unboundedSinks: s.filter((x) => !x.bounded).length,
    transfers: flowsOfKind('transfer').length,
  };
}

/**
 * Battle pass seasons, generated from the calendar (client-safe, pure).
 *
 * A season is a fixed 8-week block counted from `SEASON_EPOCH`, so a new season
 * starts by itself when the clock crosses a boundary: nobody edits an id or a
 * date. Season 1 is the original hand-written season, which ran from the epoch
 * to its `endsAt` of 2026-09-01, so its stored `UserSeasonProgress` rows (keyed
 * `S1`) keep their meaning.
 *
 * Within a season the tiers scale on their own:
 *  - each tier costs a little more XP than the one before;
 *  - coin rewards grow with the tier;
 *  - cosmetics climb in rarity towards the last tier, and which items appear
 *    rotates every season (seeded by the season number);
 *  - the whole XP curve is multiplied by `xpScale`, which the server derives
 *    from how much XP players actually earned in the previous season
 *    (`lib/battlepass/active.server.ts`), so the pass keeps pace with the site.
 *
 * Every number here is deterministic for a given (season, xpScale), which is
 * what lets the claim endpoint re-derive a tier and trust it.
 */
import { clamp } from '@/lib/core/math';
import { mulberry32 } from '@/lib/core/rng';
import { SHOP_ITEMS, type Rarity, type ShopItem } from '@/lib/shop/catalog';
import { seasonBounds, seasonNumberAt } from '@/lib/seasons/clock';

export interface PassReward {
  type:
    | 'coins'
    | 'item'
    | 'xp'
    | 'badge';
  amount?: number;
  itemId?: string; // shop item id for 'item'
  label: string;
}

export interface PassTier {
  tier: number;
  xpRequired: number; // cumulative season XP to reach this tier
  free: PassReward | null;
  premium: PassReward | null;
}

export interface Season {
  id: string;
  number: number;
  name: string;
  startsAt: string; // ISO, inclusive
  endsAt: string; // ISO, exclusive
  premiumPrice: number; // coins to unlock the premium track
  /** XP the first tier costs, after scaling; later tiers cost a little more. */
  xpPerTier: number;
  xpScale: number;
  tiers: PassTier[];
}

/**
 * The calendar is the site's one season clock (`lib/seasons/clock.ts`), shared
 * with ranked and forecasting. Season 1 ended 2026-09-01, exactly 8 weeks after
 * the epoch.
 */
export { SEASON_EPOCH, SEASON_LENGTH_DAYS, seasonNumberAt } from '@/lib/seasons/clock';

export const TIER_COUNT = 30;
/** Unscaled XP for tier 1; each later tier adds `TIER_XP_STEP`. */
const BASE_TIER_XP = 300;
const TIER_XP_STEP = 10;
/** Bounds on the automatic XP scale, so one odd season cannot break the next. */
export const MIN_XP_SCALE = 0.6;
export const MAX_XP_SCALE = 2.5;
export const PREMIUM_PRICE = 1200;

/** Unscaled XP to finish the whole pass; the scale target is measured against it. */
export const BASE_SEASON_XP = Array.from(
  { length: TIER_COUNT },
  (_, i) => BASE_TIER_XP + TIER_XP_STEP * i,
).reduce((a, b) => a + b, 0);

const SEASON_NAMES = [
  'Genesis',
  'Ignition',
  'Static',
  'Undertow',
  'Meridian',
  'Afterglow',
  'Cinder',
  'Tidewater',
  'Overdrive',
  'Solstice',
  'Quarry',
  'Monolith',
];

/** Which rarity a cosmetic tier gives. Tiers not listed give coins (or XP). */
const FREE_ITEM_TIERS: Record<number, Rarity> = {
  5: 'uncommon',
  10: 'rare',
  15: 'rare',
  20: 'epic',
  25: 'epic',
  30: 'legendary',
};
const PREMIUM_ITEM_TIERS: Record<number, Rarity> = {
  3: 'rare',
  6: 'rare',
  9: 'epic',
  12: 'epic',
  15: 'epic',
  18: 'legendary',
  21: 'legendary',
  24: 'legendary',
  27: 'mythic',
  30: 'exotic',
};

export const clampXpScale = (scale: number): number =>
  Number.isFinite(scale) ? clamp(scale, MIN_XP_SCALE, MAX_XP_SCALE) : 1;

export const seasonIdFor = (n: number): string => `S${n}`;

/** The id of the season running now (all `awardXp` needs). */
export const currentSeasonId = (at: Date | number = Date.now()): string =>
  seasonIdFor(seasonNumberAt(at));

/** Items a season may hand out: no site themes, nothing gated behind a membership. */
function rewardPool(): Map<Rarity, ShopItem[]> {
  const pool = new Map<Rarity, ShopItem[]>();
  for (const item of SHOP_ITEMS) {
    if (item.kind === 'SITE_THEME' || item.requiresTier) continue;
    const list = pool.get(item.rarity) ?? [];
    list.push(item);
    pool.set(item.rarity, list);
  }
  for (const list of pool.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return pool;
}

const coins = (amount: number): PassReward => ({
  type: 'coins',
  amount,
  label: `${amount.toLocaleString('en-US')} coins`,
});

function buildTiers(seasonNumber: number, xpScale: number): PassTier[] {
  const pool = rewardPool();
  const next = mulberry32(seasonNumber * 2654435761);
  const used = new Set<string>();
  const pick = (rarity: Rarity): PassReward | null => {
    const options = (pool.get(rarity) ?? []).filter((i) => !used.has(i.id));
    if (options.length === 0) return null;
    const item = options[Math.floor(next() * options.length)]!;
    used.add(item.id);
    return { type: 'item', itemId: item.id, label: item.name };
  };

  const tiers: PassTier[] = [];
  let cumulative = 0;
  for (let t = 1; t <= TIER_COUNT; t++) {
    cumulative += Math.round((BASE_TIER_XP + TIER_XP_STEP * (t - 1)) * xpScale);

    const freeRarity = FREE_ITEM_TIERS[t];
    let free: PassReward | null = freeRarity ? pick(freeRarity) : null;
    if (!free) {
      free =
        t % 4 === 2
          ? { type: 'xp', amount: 100 + 10 * t, label: `${100 + 10 * t} XP` }
          : coins(40 + 8 * t);
    }

    const premiumRarity = PREMIUM_ITEM_TIERS[t];
    const premium: PassReward = (premiumRarity ? pick(premiumRarity) : null) ?? coins(80 + 16 * t);

    tiers.push({ tier: t, xpRequired: cumulative, free, premium });
  }
  return tiers;
}

/** The full definition of season `n` under a given XP scale. */
export function buildSeason(n: number, xpScale = 1): Season {
  const scale = clampXpScale(xpScale);
  const { start, end } = seasonBounds(n);
  return {
    id: seasonIdFor(n),
    number: n,
    name: `Season ${n}: ${SEASON_NAMES[(n - 1) % SEASON_NAMES.length]}`,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    premiumPrice: PREMIUM_PRICE,
    xpPerTier: Math.round(BASE_TIER_XP * scale),
    xpScale: scale,
    tiers: buildTiers(n, scale),
  };
}

export function tierForXp(season: Season, seasonXp: number): number {
  let tier = 0;
  for (const t of season.tiers) {
    if (seasonXp >= t.xpRequired) tier = t.tier;
    else break;
  }
  return tier;
}

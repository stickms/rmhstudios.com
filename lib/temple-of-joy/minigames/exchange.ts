/**
 * The Indulgence Exchange.
 *
 * Ten goods, prices that wander on a one-minute beat, and a ledger you buy low
 * into and sell high out of. Profit withdraws to the temple as joy.
 *
 * The point of it is the same as Cookie Clicker's stock market: it is the one
 * system in the game that rewards *coming back later* rather than *sitting
 * here*. A price that has been falling for six days is the best thing you can
 * find in the morning, and you cannot get one by grinding.
 *
 * Prices are a bounded random walk with a slow drift term that itself
 * mean-reverts, which is enough structure to produce recognisable trends
 * without ever running away.
 */
import type { ExchangeState, GoodDef, GoodId, GoodState } from '../types';

export const GOODS: GoodDef[] = [
  { id: 'incense', name: 'Incense', symbol: 'INC', source: 'chrismworks', basePrice: 10 },
  { id: 'oil', name: 'Holy Oil', symbol: 'OIL', source: 'chrismworks', basePrice: 20 },
  { id: 'linen', name: 'Altar Linen', symbol: 'LIN', source: 'quarry', basePrice: 30 },
  { id: 'wine', name: 'Communion Wine', symbol: 'WIN', source: 'grove', basePrice: 40 },
  { id: 'gold', name: 'Leaf Gold', symbol: 'GLD', source: 'almshouse', basePrice: 50 },
  { id: 'ivory', name: 'Ivory', symbol: 'IVY', source: 'quarry', basePrice: 60 },
  { id: 'myrrhResin', name: 'Myrrh', symbol: 'MYR', source: 'grove', basePrice: 70 },
  { id: 'relics', name: 'Relics', symbol: 'REL', source: 'reliquary', basePrice: 80 },
  { id: 'psalms', name: 'Psalters', symbol: 'PSL', source: 'scriptorium', basePrice: 90 },
  { id: 'absolution', name: 'Absolution', symbol: 'ABS', source: 'sanctuary', basePrice: 100 },
];

export const GOOD_MAP: Record<GoodId, GoodDef> = Object.fromEntries(
  GOODS.map((g) => [g.id, g]),
) as Record<GoodId, GoodDef>;

/** The market moves once a minute, whether or not anyone is watching. */
export const EXCHANGE_BEAT_MS = 60_000;

/** How many prices the sparkline remembers. */
export const HISTORY = 32;

export function createExchange(): ExchangeState {
  const goods = Object.fromEntries(
    GOODS.map((g): [GoodId, GoodState] => [
      g.id,
      { price: g.basePrice, held: 0, drift: 0, history: Array(HISTORY).fill(g.basePrice) },
    ]),
  ) as Record<GoodId, GoodState>;

  return {
    unlocked: false,
    goods,
    carry: 0,
    ledger: 0,
    lifetimeProfit: 0,
    focus: 'incense',
  };
}

/**
 * How many units of a good you may hold. Levelling the Almshouse raises the
 * whole desk; levelling a good's own source raises that line specifically.
 * Without this the exchange would be a money printer rather than a puzzle.
 */
export function warehouseFor(good: GoodId, almshouseLevel: number, sourceLevel: number): number {
  return 10 * (1 + almshouseLevel) * (1 + sourceLevel);
}

/** The price ceiling and floor a good wanders between. */
export function priceBand(good: GoodId, almshouseLevel: number): { low: number; high: number } {
  const base = GOOD_MAP[good].basePrice;
  return { low: 1, high: base * 2 + almshouseLevel * 10 };
}

/**
 * Advance the market. Safe with a delta of days: the walk is applied per beat,
 * and long absences are compressed the same way the garden's are, because a
 * thousand independent steps and sixty independent steps produce the same
 * *kind* of chart and only one of them costs anything.
 */
export function advanceExchange(
  exchange: ExchangeState,
  deltaMs: number,
  almshouseLevel: number,
  random: () => number = Math.random,
): ExchangeState {
  if (!exchange.unlocked) return exchange;

  const total = exchange.carry + deltaMs;
  const beats = Math.floor(total / EXCHANGE_BEAT_MS);
  const carry = total - beats * EXCHANGE_BEAT_MS;
  if (beats <= 0) return { ...exchange, carry };

  const simulated = Math.min(beats, 120);
  // Longer absences move prices further per simulated step, so a week away
  // still produces a genuinely different market rather than the same one.
  const volatility = Math.sqrt(beats / simulated);

  const goods = { ...exchange.goods };

  for (const def of GOODS) {
    const state = { ...goods[def.id] };
    const band = priceBand(def.id, almshouseLevel);
    const history = [...state.history];

    for (let i = 0; i < simulated; i++) {
      // The drift itself mean-reverts, which is what turns noise into trends.
      state.drift = state.drift * 0.97 + (random() - 0.5) * 0.6;
      const shock = (random() - 0.5) * 2 * volatility;
      const pull = (def.basePrice - state.price) * 0.004;
      state.price = state.price + state.drift * volatility + shock + pull;

      // Occasional dramatic news, so the chart is worth checking.
      if (random() < 0.004) {
        state.price *= random() < 0.5 ? 0.55 : 1.7;
        state.drift = (random() - 0.5) * 2;
      }

      state.price = Math.max(band.low, Math.min(band.high, state.price));
      history.push(round2(state.price));
    }

    state.history = history.slice(-HISTORY);
    state.price = round2(state.price);
    goods[def.id] = state;
  }

  return { ...exchange, goods, carry };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * What a unit is worth in joy. Prices are small integers — the conversion is
 * what makes them meaningful at any point on the curve, and it is deliberately
 * tied to your rate so the exchange never becomes irrelevant or dominant.
 */
export function unitValue(jps: number): number {
  // One "point" of price is worth ten seconds of the temple's rate.
  return Math.max(1, jps * 10);
}

/** Total value of everything on the desk, in joy. */
export function deskValue(exchange: ExchangeState, jps: number): number {
  let total = exchange.ledger;
  for (const def of GOODS) {
    const state = exchange.goods[def.id];
    total += state.held * state.price * unitValue(jps);
  }
  return total;
}

/** The direction a price has moved over the visible history, as a percentage. */
export function trendOf(state: GoodState): number {
  const first = state.history[0] ?? state.price;
  if (first <= 0) return 0;
  return ((state.price - first) / first) * 100;
}

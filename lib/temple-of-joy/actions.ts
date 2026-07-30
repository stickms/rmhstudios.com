/**
 * Actions — everything the player can do, as pure `state -> state`.
 *
 * Every one of these is safe to call at any time: an action that cannot happen
 * returns the state it was given, unchanged, rather than throwing or half-
 * applying. The UI is then free to be optimistic, and the store never needs a
 * rollback path.
 */
import type {
  GameState,
  GoodId,
  Notice,
  PrayerId,
  SaintId,
  SeedId,
  SoilId,
  SourceId,
} from './types';
import {
  computeAscensionGrace,
  computeCanAscend,
  computeGraceEarned,
  computeGrossJps,
  computeKeepsMinigames,
  computeKeepsakeSlots,
  computeMaxAffordable,
  computeRateModifiers,
  computeSourceCost,
  computeSourceCostN,
  computeStartingGift,
  computeTouch,
  computeLegacyAffordable,
} from './engine';
import { BLESSING_MAP } from './data/blessings';
import { LEGACY_MAP } from './data/legacy';
import { SOURCES, SOURCE_MAP, ZERO_SOURCES } from './data/sources';
import { HALO_OUTCOMES, HALO_LIFETIME } from './data/halos';
import {
  SEED_MAP,
  SOIL_MAP,
  createGarden,
  harvestValue,
  sowCost,
  unlockedPlots,
} from './minigames/garden';
import { createChoir, swapCooldown } from './minigames/choir';
import { createExchange, unitValue, warehouseFor } from './minigames/exchange';
import { createHours, backfireChance, prayerCost, maxManaFor } from './minigames/hours';
import { levelCost, rollMannaKind } from './minigames/manna';
import { sinnerPayout } from './minigames/sinners';
import { nextId } from './tick';
import { auditTrophies } from './trophies';

/* ── Notices ─────────────────────────────────────────────────────────────── */

function notice(state: GameState, n: Omit<Notice, 'id'>): Notice[] {
  return [...state.notices, { ...n, id: Date.now() + state.notices.length }];
}

/* ══════════════════════════════════════════════════════════════════════════
   The offering
   ══════════════════════════════════════════════════════════════════════════ */

export function doTouch(state: GameState, nowMs = Date.now()): GameState {
  const recentTouches = [...state.recentTouches.filter((t) => nowMs - t < 3_000), nowMs];
  let gain = computeTouch(state);

  // Fervour: a sustained burst pays half again as much, so mashing has a shape
  // rather than being purely linear.
  if (recentTouches.length >= 8) gain *= 1.5;

  return {
    ...state,
    joy: state.joy + gain,
    runJoy: state.runJoy + gain,
    lifetimeJoy: state.lifetimeJoy + gain,
    peakJoy: Math.max(state.peakJoy, state.joy + gain),
    totalTouches: state.totalTouches + 1,
    recentTouches,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Buying
   ══════════════════════════════════════════════════════════════════════════ */

export function doBuySource(state: GameState, id: SourceId, count: number): GameState {
  if (count <= 0) return state;
  const have = state.sources[id] ?? 0;
  const cost = computeSourceCostN(id, have, count);
  if (state.joy < cost) return state;

  return {
    ...state,
    joy: state.joy - cost,
    sources: { ...state.sources, [id]: have + count },
  };
}

/** Buy the current quantity of `id`, whatever the buy-quantity switch says. */
export function doBuySourceQty(state: GameState, id: SourceId): GameState {
  const have = state.sources[id] ?? 0;
  const count = state.buyQty === 'max' ? computeMaxAffordable(id, have, state.joy) : state.buyQty;
  return doBuySource(state, id, count);
}

/** Sell copies back at a quarter of what they cost. Cookie Clicker's rate. */
export function doSellSource(state: GameState, id: SourceId, count: number): GameState {
  const have = state.sources[id] ?? 0;
  const sold = Math.min(have, count);
  if (sold <= 0) return state;
  const refund = computeSourceCostN(id, have - sold, sold) * 0.25;
  return {
    ...state,
    joy: state.joy + refund,
    sources: { ...state.sources, [id]: have - sold },
  };
}

export function doBuyBlessing(state: GameState, id: string): GameState {
  const def = BLESSING_MAP[id];
  if (!def || state.blessings.has(id) || state.joy < def.cost) return state;

  let next: GameState = {
    ...state,
    joy: state.joy - def.cost,
    blessings: new Set([...state.blessings, id]),
  };

  // A handful of blessings do something the moment they are bought.
  if (def.raptureStage !== undefined) {
    next = {
      ...next,
      rapture: def.raptureStage,
      notices: notice(next, {
        icon: def.raptureStage === 0 ? '🌕' : '🌘',
        title: def.raptureStage === 0 ? 'The window is shut' : 'Something is coming in',
        body:
          def.raptureStage === 0
            ? 'The ones already here are staying. They were invited.'
            : 'They will drink from the temple, and hand it all back when struck.',
        kind: def.raptureStage === 0 ? 'gift' : 'warn',
      }),
    };
  }

  if (id === 'steward') next = { ...next, stewardEnabled: true };

  return next;
}

/* ══════════════════════════════════════════════════════════════════════════
   Manna
   ══════════════════════════════════════════════════════════════════════════ */

export function doLevelSource(state: GameState, id: SourceId): GameState {
  const level = state.sourceLevels[id] ?? 0;
  const cost = levelCost(level);
  if (state.manna.held < cost) return state;

  let next: GameState = {
    ...state,
    manna: { ...state.manna, held: state.manna.held - cost },
    sourceLevels: { ...state.sourceLevels, [id]: level + 1 },
  };

  // Level 1 of four particular sources opens a minigame. This is the only way
  // in, and it is why the twenty-hour resource matters from the very first one.
  const def = SOURCE_MAP[id];
  if (def.minigame && level === 0) next = openMinigame(next, def.minigame);

  return next;
}

function openMinigame(state: GameState, minigame: string): GameState {
  const titles: Record<string, [string, string, string]> = {
    garden: ['🌱', 'The Garden of Eden', 'Break the ground. Sow something. Come back tomorrow.'],
    exchange: ['📈', 'The Indulgence Exchange', 'Buy low. Absolve high. Check it in the morning.'],
    choir: ['🎼', 'The Choir of Saints', 'Three stalls. Twelve applicants. Choose carefully.'],
    hours: ['📖', 'The Book of Hours', 'Mana refills on its own. Prayers do not always work.'],
  };
  const [icon, title, body] = titles[minigame] ?? ['✨', 'Something opened', ''];
  const next = { ...state, notices: notice(state, { icon, title, body, kind: 'gift' }) };

  switch (minigame) {
    case 'garden':
      return { ...next, garden: { ...next.garden, unlocked: true } };
    case 'choir':
      return { ...next, choir: { ...next.choir, unlocked: true } };
    case 'exchange':
      return { ...next, exchange: { ...next.exchange, unlocked: true } };
    case 'hours':
      return {
        ...next,
        hours: { ...next.hours, unlocked: true, maxMana: maxManaFor(1, next.hours.said) },
      };
    default:
      return next;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Halos
   ══════════════════════════════════════════════════════════════════════════ */

export function doCatchHalo(state: GameState, haloId: number): GameState {
  const halo = state.halos.find((h) => h.id === haloId);
  if (!halo) return state;

  const pool = HALO_OUTCOMES.filter((o) => o.kind === halo.kind);
  const total = pool.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * total;
  let outcome = pool[0]!;
  for (const candidate of pool) {
    roll -= candidate.weight;
    if (roll <= 0) {
      outcome = candidate;
      break;
    }
  }

  const potency = computeRateModifiers(state).haloPotency;
  const jps = computeGrossJps(state);

  let next: GameState = {
    ...state,
    halos: state.halos.filter((h) => h.id !== haloId),
    halosCaught: state.halosCaught + 1,
    haloStreak: state.haloStreak + 1,
  };

  if (outcome.gift) {
    // Cookie Clicker's Lucky: a share of what you *hold*, capped by a window of
    // your rate. Banking joy before catching one is a real strategy because of
    // this line, which is why it is worth keeping exactly as it is.
    const gain =
      (Math.min(state.joy * outcome.gift.joyShare, jps * outcome.gift.rateSeconds) +
        outcome.gift.flat) *
      potency;
    next = grantJoy(next, gain);
  }

  if (outcome.toll) {
    const loss = Math.min(
      next.joy,
      Math.min(next.joy * outcome.toll.joyShare, jps * outcome.toll.rateSeconds),
    );
    next = { ...next, joy: next.joy - loss };
  }

  if (outcome.jps) {
    next = withBuff(next, {
      id: `${outcome.id}_${halo.id}`,
      name: outcome.name,
      icon: outcome.icon,
      // A penalty is not made worse by potency — potency is a blessing.
      jpsMultiplier:
        outcome.jps.multiplier >= 1
          ? 1 + (outcome.jps.multiplier - 1) * potency
          : outcome.jps.multiplier,
      touchMultiplier: 1,
      remaining: outcome.jps.seconds,
      duration: outcome.jps.seconds,
    });
  }

  if (outcome.touch) {
    next = withBuff(next, {
      id: `${outcome.id}_${halo.id}`,
      name: outcome.name,
      icon: outcome.icon,
      jpsMultiplier: 1,
      touchMultiplier: 1 + (outcome.touch.multiplier - 1) * potency,
      remaining: outcome.touch.seconds,
      duration: outcome.touch.seconds,
    });
  }

  if (outcome.congregation) {
    let copies = 0;
    for (const source of SOURCES) copies += next.sources[source.id] ?? 0;
    next = withBuff(next, {
      id: `${outcome.id}_${halo.id}`,
      name: outcome.name,
      icon: outcome.icon,
      jpsMultiplier: 1 + copies * outcome.congregation.perSource * potency,
      touchMultiplier: 1,
      remaining: outcome.congregation.seconds,
      duration: outcome.congregation.seconds,
    });
  }

  if (outcome.storm) {
    const rained = Array.from({ length: outcome.storm }, () => ({
      id: nextId(),
      kind: halo.kind,
      x: 0.1 + Math.random() * 0.8,
      y: 0.1 + Math.random() * 0.8,
      // Storm halos are fleeting on purpose: it is a scramble, not a windfall.
      life: 4,
      maxLife: 4,
    }));
    next = { ...next, halos: [...next.halos, ...rained] };
  }

  if (outcome.manna) {
    next = {
      ...next,
      manna: {
        ...next.manna,
        ripening: next.manna.ripening + outcome.manna * 20 * 60 * 60 * 1000,
      },
    };
  }

  if (halo.kind === 'seraphic') {
    next = { ...next, trophies: new Set([...next.trophies, 'halo_seraphic']) };
  }

  return {
    ...next,
    notices: notice(next, {
      icon: outcome.icon,
      title: outcome.name,
      body: outcome.note,
      kind: outcome.toll ? 'warn' : 'gift',
    }),
  };
}

function withBuff(state: GameState, buff: GameState['buffs'][number]): GameState {
  return { ...state, buffs: [...state.buffs, buff] };
}

/* ══════════════════════════════════════════════════════════════════════════
   Sinners
   ══════════════════════════════════════════════════════════════════════════ */

export function doStrikeSinner(state: GameState, sinnerId: number): GameState {
  const sinner = state.sinners.find((s) => s.id === sinnerId);
  if (!sinner) return state;

  const payout = sinnerPayout(sinner, computeRateModifiers(state).sinnerYield);
  const next = grantJoy(
    {
      ...state,
      sinners: state.sinners.filter((s) => s.id !== sinnerId),
      sinnersStruck: state.sinnersStruck + 1,
      sinnerHarvest: state.sinnerHarvest + payout,
    },
    payout,
  );

  return sinner.penitent ? { ...next, trophies: new Set([...next.trophies, 'penitent']) } : next;
}

/** Strike every Sinner at once. The reason a full house is worth leaving. */
export function doStrikeAllSinners(state: GameState): GameState {
  if (state.sinners.length === 0) return state;
  const yieldMultiplier = computeRateModifiers(state).sinnerYield;

  let payout = 0;
  let penitent = false;
  for (const sinner of state.sinners) {
    payout += sinnerPayout(sinner, yieldMultiplier);
    if (sinner.penitent) penitent = true;
  }

  const next = grantJoy(
    {
      ...state,
      sinners: [],
      sinnersStruck: state.sinnersStruck + state.sinners.length,
      sinnerHarvest: state.sinnerHarvest + payout,
    },
    payout,
  );

  return penitent ? { ...next, trophies: new Set([...next.trophies, 'penitent']) } : next;
}

/* ══════════════════════════════════════════════════════════════════════════
   Garden
   ══════════════════════════════════════════════════════════════════════════ */

export function doSow(state: GameState, index: number): GameState {
  const seed = state.garden.selected;
  if (!seed || !state.garden.unlocked) return state;
  if (!unlockedPlots(state.sourceLevels.grove ?? 0).has(index)) return state;
  if (state.garden.plots[index]?.seed) return state;

  const cost = sowCost(seed, computeGrossJps(state));
  if (state.joy < cost) return state;

  const plots = [...state.garden.plots];
  plots[index] = { seed, growth: 0, age: 0 };
  return { ...state, joy: state.joy - cost, garden: { ...state.garden, plots } };
}

export function doHarvest(state: GameState, index: number): GameState {
  const plot = state.garden.plots[index];
  if (!plot?.seed) return state;

  const gain = harvestValue(plot, computeGrossJps(state), state.garden.soil);
  const plots = [...state.garden.plots];
  plots[index] = { seed: null, growth: 0, age: 0 };

  let next = grantJoy({ ...state, garden: { ...state.garden, plots } }, gain);
  if (plot.growth >= 100) {
    next = { ...next, trophies: new Set([...next.trophies, 'garden_harvest']) };
  }
  return next;
}

/** Clear every ripe plant at once. */
export function doHarvestAll(state: GameState): GameState {
  let next = state;
  state.garden.plots.forEach((plot, i) => {
    if (plot.seed && plot.growth >= 100) next = doHarvest(next, i);
  });
  return next;
}

export function doSelectSeed(state: GameState, seed: SeedId | null): GameState {
  if (seed && !state.garden.known.includes(seed)) return state;
  return { ...state, garden: { ...state.garden, selected: seed } };
}

/**
 * Change the soil. Costs an hour before it can change again, and clears
 * nothing — the plants carry on, they simply grow at a different pace.
 */
export function doTill(state: GameState, soil: SoilId): GameState {
  const def = SOIL_MAP[soil];
  if (!def || state.garden.soilCooldown > 0) return state;
  if ((state.sourceLevels.grove ?? 0) < def.requiresLevel) return state;
  return { ...state, garden: { ...state.garden, soil, soilCooldown: 3_600_000 } };
}

/* ══════════════════════════════════════════════════════════════════════════
   Choir
   ══════════════════════════════════════════════════════════════════════════ */

export function doSeatSaint(state: GameState, stall: 0 | 1 | 2, saint: SaintId | null): GameState {
  if (!state.choir.unlocked || state.choir.cooldown > 0) return state;

  const stalls: [SaintId | null, SaintId | null, SaintId | null] = [...state.choir.stalls];
  // A saint sings in one stall at a time; seating them again moves them.
  if (saint) {
    const existing = stalls.indexOf(saint);
    if (existing >= 0) stalls[existing] = null;
  }
  stalls[stall] = saint;

  const swaps = state.choir.swaps + 1;
  return { ...state, choir: { ...state.choir, stalls, swaps, cooldown: swapCooldown(swaps) } };
}

/* ══════════════════════════════════════════════════════════════════════════
   Exchange
   ══════════════════════════════════════════════════════════════════════════ */

/** Which source's levels raise each good's warehouse. */
const GOOD_SOURCE: Record<GoodId, SourceId> = {
  incense: 'chrismworks',
  oil: 'chrismworks',
  linen: 'quarry',
  wine: 'grove',
  gold: 'almshouse',
  ivory: 'quarry',
  myrrhResin: 'grove',
  relics: 'reliquary',
  psalms: 'scriptorium',
  absolution: 'sanctuary',
};

export function goodCapacity(state: GameState, good: GoodId): number {
  return warehouseFor(
    good,
    state.sourceLevels.almshouse ?? 0,
    state.sourceLevels[GOOD_SOURCE[good]] ?? 0,
  );
}

export function doBuyGood(state: GameState, good: GoodId, units: number): GameState {
  if (!state.exchange.unlocked || units <= 0) return state;
  const line = state.exchange.goods[good];
  const buying = Math.min(units, goodCapacity(state, good) - line.held);
  if (buying <= 0) return state;

  const cost = buying * line.price * unitValue(computeGrossJps(state));
  if (state.joy < cost) return state;

  let next: GameState = {
    ...state,
    joy: state.joy - cost,
    exchange: {
      ...state.exchange,
      goods: { ...state.exchange.goods, [good]: { ...line, held: line.held + buying } },
    },
  };

  // Buying a good at a tenth of its base price is the whole skill of the
  // exchange, so it is worth a trophy.
  if (line.price <= GOOD_BASE[good] * 0.1) {
    next = { ...next, trophies: new Set([...next.trophies, 'exchange_crash']) };
  }
  return next;
}

export function doSellGood(state: GameState, good: GoodId, units: number): GameState {
  if (!state.exchange.unlocked) return state;
  const line = state.exchange.goods[good];
  const selling = Math.min(units, line.held);
  if (selling <= 0) return state;

  const jps = computeGrossJps(state);
  const gain = selling * line.price * unitValue(jps);

  let next = grantJoy(
    {
      ...state,
      exchange: {
        ...state.exchange,
        lifetimeProfit: state.exchange.lifetimeProfit + gain,
        goods: { ...state.exchange.goods, [good]: { ...line, held: line.held - selling } },
      },
    },
    gain,
  );

  if (jps > 0 && gain >= jps * 3_600) {
    next = { ...next, trophies: new Set([...next.trophies, 'exchange_big']) };
  }
  return next;
}

export function doFocusGood(state: GameState, good: GoodId): GameState {
  return { ...state, exchange: { ...state.exchange, focus: good } };
}

/** Base prices, for the "bought the bottom" check. */
const GOOD_BASE: Record<GoodId, number> = {
  incense: 10,
  oil: 20,
  linen: 30,
  wine: 40,
  gold: 50,
  ivory: 60,
  myrrhResin: 70,
  relics: 80,
  psalms: 90,
  absolution: 100,
};

/* ══════════════════════════════════════════════════════════════════════════
   Book of Hours
   ══════════════════════════════════════════════════════════════════════════ */

export function doPray(state: GameState, prayer: PrayerId): GameState {
  if (!state.hours.unlocked) return state;
  const cost = prayerCost(prayer, state.hours.maxMana);
  if (state.hours.mana < cost) return state;

  const failed = Math.random() < backfireChance(prayer, state.hours.said, state.rapture);
  const jps = computeGrossJps(state);

  const spent: GameState = {
    ...state,
    hours: {
      ...state.hours,
      mana: state.hours.mana - cost,
      said: state.hours.said + 1,
      backfired: state.hours.backfired + (failed ? 1 : 0),
    },
  };

  const outcome = failed ? applyBackfire(spent, prayer) : applyPrayer(spent, prayer, jps);

  return {
    ...outcome.state,
    hours: { ...outcome.state.hours, last: { prayer, outcome: outcome.text, good: !failed } },
    notices: notice(outcome.state, {
      icon: failed ? '🕯️' : '✨',
      title: failed ? 'It went otherwise' : 'It was heard',
      body: outcome.text,
      kind: failed ? 'warn' : 'gift',
    }),
  };
}

interface PrayerOutcome {
  state: GameState;
  text: string;
}

function applyPrayer(state: GameState, prayer: PrayerId, jps: number): PrayerOutcome {
  switch (prayer) {
    case 'conjureJoy': {
      const gain = Math.min(jps * 1_800, state.joy * 0.2);
      return {
        state: grantJoy(state, gain),
        text: 'Thirty minutes of the temple, out of nothing at all.',
      };
    }

    case 'forceTheHand': {
      const life = HALO_LIFETIME * computeRateModifiers(state).haloPatience;
      return {
        state: {
          ...state,
          halos: [
            ...state.halos,
            {
              id: nextId(),
              kind: state.rapture > 0 && Math.random() < 0.3 ? 'sable' : 'gilded',
              x: 0.35 + Math.random() * 0.3,
              y: 0.3 + Math.random() * 0.3,
              life,
              maxLife: life,
            },
          ],
          trophies: new Set([...state.trophies, 'hours_hand']),
        },
        text: 'Providence arrives, visibly put out at having been summoned.',
      };
    }

    case 'raiseTheFallen': {
      if (state.rapture === 0)
        return { state, text: 'Nothing answers. Nothing was there to answer.' };
      const room = 12 - state.sinners.length;
      const count = Math.max(0, Math.min(room, Math.max(1, Math.floor(state.sinnersStruck / 10))));
      const risen = Array.from({ length: count }, (_, i) => ({
        id: nextId(),
        // They come back already fed — an hour's worth each.
        swallowed: jps * 3_600,
        arrival: 1,
        angle: ((state.sinners.length + i) * 137.5) % 360,
        penitent: Math.random() < 0.1,
      }));
      return {
        state: { ...state, sinners: [...state.sinners, ...risen] },
        text: `${risen.length} of them come back, and they are not hungry.`,
      };
    }

    case 'buildInAnInstant': {
      const best = [...SOURCES].reverse().find((s) => (state.sources[s.id] ?? 0) > 0);
      if (!best) return { state, text: 'There is nothing yet to build upon.' };
      const have = state.sources[best.id] ?? 0;
      const built = Math.max(1, Math.floor(have * 0.1));
      return {
        state: {
          ...state,
          sources: { ...state.sources, [best.id]: have + built },
          trophies: new Set([...state.trophies, 'hours_edifice']),
        },
        text: `${built} more ${best.name}, raised out of the afternoon.`,
      };
    }

    case 'stretchTime': {
      if (state.buffs.length === 0)
        return { state, text: 'Nothing to stretch. The hour is already itself.' };
      return {
        state: {
          ...state,
          buffs: state.buffs.map((b) => ({
            ...b,
            remaining: b.remaining * 2,
            duration: b.duration * 2,
          })),
        },
        text: 'Every blessing on you doubles its stay.',
      };
    }

    case 'gatherManna':
      return {
        state: {
          ...state,
          manna: { ...state.manna, ripening: state.manna.ripening + 20 * 60 * 60 * 1000 },
        },
        text: 'It ripens where it stands.',
      };

    case 'diviningRod': {
      const unknown = Object.values(SEED_MAP).filter(
        (s) => !state.garden.known.includes(s.id) && !s.bane,
      );
      if (unknown.length === 0) return { state, text: 'The garden has nothing left to hide.' };
      const found = unknown[Math.floor(Math.random() * unknown.length)]!;
      return {
        state: { ...state, garden: { ...state.garden, known: [...state.garden.known, found.id] } },
        text: `The rod dips over ${found.name}.`,
      };
    }

    default:
      return { state, text: 'Nothing happens.' };
  }
}

function applyBackfire(state: GameState, prayer: PrayerId): PrayerOutcome {
  switch (prayer) {
    case 'conjureJoy':
      return {
        state: withBuff(state, {
          id: `backfire_${nextId()}`,
          name: 'A Silent Hour',
          icon: '🕯️',
          jpsMultiplier: 0.5,
          touchMultiplier: 1,
          remaining: 66,
          duration: 66,
        }),
        text: 'The temple goes quiet for a while. It will pass.',
      };

    case 'forceTheHand':
      return {
        state: {
          ...state,
          halos: [
            ...state.halos,
            {
              id: nextId(),
              kind: 'sable',
              x: 0.4,
              y: 0.35,
              life: HALO_LIFETIME,
              maxLife: HALO_LIFETIME,
            },
          ],
        },
        text: 'Something answered. It is not the thing you called.',
      };

    case 'raiseTheFallen':
      return {
        state: { ...state, joy: state.joy * 0.9 },
        text: 'They came back for what they were owed, and took it directly.',
      };

    case 'buildInAnInstant': {
      const best = [...SOURCES].reverse().find((s) => (state.sources[s.id] ?? 0) > 1);
      if (!best) return { state, text: 'Nothing falls down. There is nothing to fall.' };
      const have = state.sources[best.id] ?? 0;
      const lost = Math.max(1, Math.floor(have * 0.05));
      return {
        state: { ...state, sources: { ...state.sources, [best.id]: have - lost } },
        text: `${lost} ${best.name} come apart quietly overnight.`,
      };
    }

    case 'stretchTime':
      return { state: { ...state, buffs: [] }, text: 'Every blessing on you ends at once.' };

    case 'gatherManna':
      return {
        state: { ...state, manna: { ...state.manna, ripening: 0, kind: rollMannaKind() } },
        text: 'It spoils on the stone. Start again.',
      };

    case 'diviningRod': {
      const plots = [...state.garden.plots];
      for (const index of unlockedPlots(state.sourceLevels.grove ?? 0)) {
        if (!plots[index]?.seed) {
          plots[index] = { seed: 'thorn', growth: 0, age: 0 };
          break;
        }
      }
      return {
        state: { ...state, garden: { ...state.garden, plots } },
        text: 'A weed. Just a weed.',
      };
    }

    default:
      return { state, text: 'Nothing happens, at some length.' };
  }
}

function grantJoy(state: GameState, gain: number): GameState {
  if (!Number.isFinite(gain) || gain <= 0) return state;
  return {
    ...state,
    joy: state.joy + gain,
    runJoy: state.runJoy + gain,
    lifetimeJoy: state.lifetimeJoy + gain,
    peakJoy: Math.max(state.peakJoy, state.joy + gain),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Ascension
   ══════════════════════════════════════════════════════════════════════════ */

export function doBuyLegacy(state: GameState, id: string): GameState {
  if (!computeLegacyAffordable(state, id)) return state;
  const def = LEGACY_MAP[id]!;
  return {
    ...state,
    grace: state.grace - def.cost,
    graceSpent: state.graceSpent + def.cost,
    legacy: new Set([...state.legacy, id]),
    notices: notice(state, {
      icon: def.icon,
      title: def.name,
      body: def.description,
      kind: 'gift',
    }),
  };
}

export function doSetKeepsakes(state: GameState, ids: string[]): GameState {
  return { ...state, keepsakes: ids.slice(0, computeKeepsakeSlots(state)) };
}

/**
 * Ascend: give the whole run back and receive Grace for it.
 *
 * Everything on the "kept" side of this function is itself a Legacy purchase —
 * the keepsakes, the starting gift, the minigames. A first ascension keeps
 * almost nothing and is meant to feel like a real cost; a fiftieth keeps most
 * of the shape of the temple and takes twenty minutes to surpass.
 */
export function doAscend(state: GameState): GameState {
  if (!computeCanAscend(state)) return state;

  const gained = computeAscensionGrace(state);
  const keptBlessings = new Set(
    state.keepsakes.filter((id) => state.blessings.has(id)).slice(0, computeKeepsakeSlots(state)),
  );
  const gift = computeStartingGift(state);
  const keepMinigames = computeKeepsMinigames(state);

  return {
    ...state,
    // ── Given back ──
    joy: gift.joy,
    runJoy: 0,
    peakJoy: gift.joy,
    sources: { ...ZERO_SOURCES, acolyte: gift.acolytes },
    sourceEarnings: { ...ZERO_SOURCES },
    blessings: keptBlessings,
    buffs: [],
    halos: [],
    haloTimer: 120,
    sinners: [],
    rapture: 0,
    runPlaytime: 0,

    // ── Carried ──
    grace: state.grace + gained,
    graceEarned: computeGraceEarned(state.lifetimeJoy),
    ascensions: state.ascensions + 1,

    // Manna levels are never lost. They are the one thing an ascension cannot
    // take, which is what makes the twenty-hour resource feel like the real
    // progression rather than a side dish.
    sourceLevels: state.sourceLevels,

    garden: keepMinigames ? state.garden : { ...createGarden(), unlocked: state.garden.unlocked },
    choir: keepMinigames ? state.choir : { ...createChoir(), unlocked: state.choir.unlocked },
    exchange: keepMinigames
      ? state.exchange
      : { ...createExchange(), unlocked: state.exchange.unlocked },
    hours: keepMinigames ? state.hours : { ...createHours(), unlocked: state.hours.unlocked },

    showAscendDialog: false,
    tab: 'temple',
    notices: notice(state, {
      icon: '☁️',
      title: `${gained} Grace`,
      body: 'You gave the whole thing back and were handed something better.',
      kind: 'gift',
    }),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Odds and ends
   ══════════════════════════════════════════════════════════════════════════ */

export function doDismissNotice(state: GameState, id: number): GameState {
  return { ...state, notices: state.notices.filter((n) => n.id !== id) };
}

/** Run the trophy audit once, outside the tick. Used on load. */
export function doAudit(state: GameState): GameState {
  return auditTrophies(state);
}

export { computeSourceCost };

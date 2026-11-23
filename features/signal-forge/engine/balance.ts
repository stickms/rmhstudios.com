/**
 * Signal Forge, the one balance module. Every tunable number of the rework lives here (card, enemy, relic and
 * event numbers live in their data tables beside it). The reasoning, the card-power budget and the simulated
 * win-rate bands are recorded in docs/signal-forge/balance.md and asserted by __tests__/balance.test.ts.
 */
import type { CardDef, Timing } from './types';

export const PLAYER = {
  maxHp: 72,
  energy: 3,
  handSize: 5,
  /** Cards that may be held at once (draws past this are skipped). */
  handCap: 10,
  startGold: 99,
} as const;

/** The rhythm layer. */
export const RHYTHM = {
  /** Damage and block multiplier of a card played on the phrase, by timing. Off-phrase plays use 1. */
  mult: { perfect: 1.5, good: 1.25, late: 1.0, steady: 1.25 } satisfies Record<Timing, number>,
  /** Heat an on-phrase play earns, by timing. */
  heat: { perfect: 2, good: 1, late: 1, steady: 1 } satisfies Record<Timing, number>,
  /** Timed mode windows around the beat, in ms (each side). */
  perfectMs: 85,
  goodMs: 170,
  /** Beats per minute per act (the metronome the timed mode plays against). */
  bpm: { 1: 80, 2: 90, 3: 100 } as Record<1 | 2 | 3, number>,
  /** Phrase length per act. */
  phraseLen: { 1: 3, 2: 3, 3: 4 } as Record<1 | 2 | 3, number>,
  heatCap: 10,
  /** Forge Burst: base + perHeat * heat, to every enemy, when a phrase completes. Spends the Heat. */
  burstBase: 5,
  burstPerHeat: 2,
  /** Vent (once per turn): Block per Heat, spends the Heat. */
  ventPerHeat: 3,
  /** Off-phrase plays add Static; at the threshold a Glitch card enters the discard and Static resets. */
  staticThreshold: 4,
} as const;

export const STATUS = {
  vulnMult: 1.5,
  weakMult: 0.75,
  frailMult: 0.75,
} as const;

export const ECONOMY = {
  gold: { combat: [14, 20], elite: [30, 40], boss: [95, 95] } as Record<'combat' | 'elite' | 'boss', [number, number]>,
  cardPrice: { common: 48, uncommon: 72, rare: 128 } as Record<'common' | 'uncommon' | 'rare', number>,
  relicPrice: { common: 140, uncommon: 175, rare: 220 } as Record<'common' | 'uncommon' | 'rare', number>,
  removeBase: 75,
  removeStep: 25,
  /** Rest (Cooling Bay): heal this share of max HP, or temper one card. */
  restHeal: 0.3,
  /** Heal after beating an act boss: this share of missing HP. */
  bossHeal: 0.6,
  /** Card reward rarity weights by fight kind: common / uncommon / rare. */
  rewardOdds: {
    combat: [62, 32, 6],
    elite: [40, 45, 15],
    boss: [0, 0, 100],
  } as Record<'combat' | 'elite' | 'boss', [number, number, number]>,
  rewardChoices: 3,
} as const;

/** The map: rows per act (the boss is one more row), lanes, and node odds. */
export const MAP = {
  rows: 7,
  lanes: 3,
  /** Weights for an ordinary node by row band: combat, elite, event, shop, rest, treasure. */
  early: [62, 0, 28, 10, 0, 0],
  mid: [42, 18, 22, 10, 8, 0],
  late: [38, 22, 20, 8, 12, 0],
} as const;

/** Ascension: each level adds its modifier and keeps the ones below it. */
export interface AscensionLevel {
  level: number;
  /** English default for t(`asc.<level>`). */
  text: string;
}

export const ASCENSION: AscensionLevel[] = [
  { level: 1, text: 'Ordinary enemies have 10% more HP.' },
  { level: 2, text: 'Elites hit 20% harder.' },
  { level: 3, text: 'Your deck starts with a Glitch.' },
  { level: 4, text: 'The Cooling Bay heals 20% instead of 30%.' },
  { level: 5, text: 'Act bosses have 15% more HP.' },
  { level: 6, text: 'You start each run with 10% less HP.' },
  { level: 7, text: 'Shop prices are 15% higher.' },
  { level: 8, text: 'Static overloads at 3 instead of 4.' },
  { level: 9, text: 'Card rewards offer two cards instead of three.' },
  { level: 10, text: 'Every enemy deals 10% more damage.' },
];
export const MAX_ASCENSION = ASCENSION.length;

export interface AscensionMods {
  normalHp: number;
  eliteDmg: number;
  startGlitch: boolean;
  restHeal: number;
  bossHp: number;
  startHpMult: number;
  priceMult: number;
  staticThreshold: number;
  rewardChoices: number;
  allDmg: number;
}

export function ascensionMods(level: number): AscensionMods {
  return {
    normalHp: level >= 1 ? 1.1 : 1,
    eliteDmg: level >= 2 ? 1.2 : 1,
    startGlitch: level >= 3,
    restHeal: level >= 4 ? 0.2 : ECONOMY.restHeal,
    bossHp: level >= 5 ? 1.15 : 1,
    startHpMult: level >= 6 ? 0.9 : 1,
    priceMult: level >= 7 ? 1.15 : 1,
    staticThreshold: level >= 8 ? 3 : RHYTHM.staticThreshold,
    rewardChoices: level >= 9 ? 2 : ECONOMY.rewardChoices,
    allDmg: level >= 10 ? 1.1 : 1,
  };
}

/** Score: what a node is worth, plus per-play skill bonuses (capped), times an ascension multiplier. */
export const SCORE = {
  combat: 100,
  elite: 350,
  boss: 1200,
  victory: 5000,
  perPerfect: 4,
  perBurst: 20,
  /** Caps on the skill bonuses per run, so the score ceiling is finite and honest. */
  perfectCap: 600,
  burstCap: 150,
  /** Each ascension level adds this share. */
  ascensionStep: 0.15,
  /** Nodes on a full run: 3 acts x (7 rows + boss). */
  nodesPerAct: 8,
} as const;

/** Score multiplier for an act (later acts are worth more). */
export function actMult(act: number): number {
  return act;
}

/**
 * The most a run can score: every node an elite where one could be (an upper bound), every boss, victory and
 * both skill caps, at max ascension. The catalog ceiling (`scoring.maxScore`) must be at or above this.
 */
export function maxPossibleScore(): number {
  let nodes = 0;
  for (let act = 1; act <= 3; act++) nodes += (SCORE.elite * MAP.rows + SCORE.boss) * actMult(act);
  const skill = SCORE.perfectCap * SCORE.perPerfect + SCORE.burstCap * SCORE.perBurst;
  return Math.ceil((nodes + SCORE.victory + skill) * (1 + SCORE.ascensionStep * MAX_ASCENSION));
}

/** An upgraded number: damage and block grow by a third (at least 2), statuses by 1. */
export function upgradeNumber(key: string, n: number): number {
  if (key === 'dmg' || key === 'block' || key === 'heal') return n + Math.max(2, Math.ceil(n / 3));
  if (key === 'bleed' || key === 'weak' || key === 'vuln' || key === 'heat' || key === 'dmgPerHeat' || key === 'blockPerHeat' || key === 'dmgPerPlayed' || key === 'dmgPerStatic' || key === 'burstBonus') return n + 1;
  return n;
}

/**
 * The card-power budget. A card's power is its effects priced in "damage points" (1 energy buys about 6);
 * its budget is what its cost and rarity allow. Situational effects are priced at a typical value
 * (4 Heat held, 2 Static, 2 cards already played, 8 Block). __tests__/balance.test.ts asserts every
 * playable card sits inside its band, so an outlier is a test failure, not a feeling.
 */
export const POWER = {
  perEnergy: 6,
  base: 4,
  rarityBonus: { starter: 0, common: 0, uncommon: 3, rare: 7, glitch: 0 } as Record<string, number>,
  /** Exhaust cards may be this much stronger (they are spent). */
  exhaustMult: 1.45,
  /** Allowed spread below/above budget. */
  bandLow: 0.7,
  bandHigh: 1.3,
  typical: { heat: 4, static: 2, played: 2, block: 8, bleed: 4 },
} as const;

export function cardPower(c: CardDef): number {
  const T = POWER.typical;
  const hits = c.hits ?? 1;
  let dmg = (c.dmg ?? 0) + (c.dmgPerHeat ?? 0) * T.heat + (c.dmgPerStatic ?? 0) * T.static + (c.dmgPerPlayed ?? 0) * T.played;
  dmg *= hits;
  if (c.blockAsDmg) dmg += T.block;
  if (c.aoe) dmg *= 1.6;
  let p = dmg;
  p += (c.block ?? 0) + (c.blockPerHeat ?? 0) * T.heat;
  if (c.blockFromHurt) p += 3;
  p += (c.draw ?? 0) * 4;
  p += (c.energy ?? 0) * 6;
  p += (c.heat ?? 0) * 2;
  p += (c.bleed ?? 0) * 1.5 * (c.aoe ? 1.6 : 1);
  p += ((c.weak ?? 0) * 2.5 + (c.vuln ?? 0) * 2.5) * (c.aoe ? 1.6 : 1);
  if (c.jam) p += c.aoe ? 12 : 7;
  p += (c.strength ?? 0) * 6;
  p += (c.cool ?? 0) * 1.5;
  p += (c.purge ?? 0) * 3;
  p += (c.heal ?? 0) * 1.5;
  p += (c.burstBonus ?? 0) * 0.8;
  if (c.skipSlot) p += 4;
  if (c.doubleBleed) p += T.bleed;
  // A wildcard fits any phrase slot: worth half an energy.
  if (c.wave === 'any') p += 3;
  if (c.retain) p += 1;
  if (c.innate) p += 1;
  p -= (c.static ?? 0) * 2;
  p -= (c.selfDmg ?? 0) * 1;
  p -= (c.glitch ?? 0) * 4;
  if (c.spendHeat) p -= 2;
  if (c.ethereal) p -= 1;
  return Math.round(p * 10) / 10;
}

export function cardBudget(c: CardDef): number {
  const b = c.cost * POWER.perEnergy + POWER.base + (POWER.rarityBonus[c.rarity] ?? 0);
  return c.exhaust ? b * POWER.exhaustMult : b;
}

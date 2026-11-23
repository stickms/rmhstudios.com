/**
 * Project Vega's achievements, decided from the facts of one finished (or abandoned) run. Pure and client-safe:
 * the score route calls it after bounding the facts, then grants each id (`grantAchievement` is idempotent), and
 * the end screen calls it to show what the run earned. Ids are permanent (lib/achievements/catalog.ts).
 */
import { BOSS_EVERY, ECONOMY, TOWER_ORDER, TOWERS, WAVES, type MapId, type TowerType } from './data';

export interface VegaRunFacts {
  map: MapId;
  /** Waves cleared. */
  cleared: number;
  integrityLost: number;
  typesBuilt: TowerType[];
  /** Highest tier reached by any instrument: 0, 1 or 2 (I, II, III). */
  maxTier: number;
  earlyCalls: number;
  bossesKilled: number;
  biobankIncome: number;
}

export const VEGA_ACHIEVEMENTS = {
  firstIntake: 'game.vega.first_intake',
  firstBoss: 'game.vega.first_boss',
  wave20: 'game.vega.wave_20',
  containment: 'game.vega.containment',
  vault: 'game.vega.vault_containment',
  theatre: 'game.vega.theatre_containment',
  flawless: 'game.vega.flawless',
  overtime: 'game.vega.overtime_60',
  formulary: 'game.vega.full_formulary',
  tierThree: 'game.vega.tier_three',
  earlyCaller: 'game.vega.early_caller',
  biobank: 'game.vega.biobank_tycoon',
  monotherapy: 'game.vega.monotherapy',
} as const;

export const OVERTIME_WAVE = 60;
export const EARLY_CALLS_NEEDED = 10;
export const BIOBANK_INCOME_NEEDED = 2_000;
export const MONOTHERAPY_WAVE = 15;

/** Achievement ids this run satisfies. */
export function vegaAchievementsFor(f: VegaRunFacts): string[] {
  const out: string[] = [];
  const A = VEGA_ACHIEVEMENTS;
  if (f.cleared >= 1) out.push(A.firstIntake);
  if (f.bossesKilled >= 1) out.push(A.firstBoss);
  if (f.cleared >= 20) out.push(A.wave20);
  if (f.cleared >= WAVES.GOAL) {
    out.push(A.containment);
    if (f.map === 'vault') out.push(A.vault);
    if (f.map === 'theatre') out.push(A.theatre);
    if (f.integrityLost === 0) out.push(A.flawless);
  }
  if (f.cleared >= OVERTIME_WAVE) out.push(A.overtime);
  if (TOWER_ORDER.every((t) => f.typesBuilt.includes(t))) out.push(A.formulary);
  if (f.maxTier >= 2) out.push(A.tierThree);
  if (f.earlyCalls >= EARLY_CALLS_NEEDED) out.push(A.earlyCaller);
  if (f.biobankIncome >= BIOBANK_INCOME_NEEDED) out.push(A.biobank);
  if (f.typesBuilt.length === 1 && f.cleared >= MONOTHERAPY_WAVE) out.push(A.monotherapy);
  return out;
}

/**
 * Whether facts are consistent with the waves cleared. Not proof (the client is untrusted, as everywhere a
 * score is submitted), but it stops claims no run could produce: more early calls than waves, more bosses
 * than boss waves, more bank income than eight tier-III banks could pay.
 */
export function plausibleFacts(f: VegaRunFacts): boolean {
  if (!Number.isInteger(f.cleared) || f.cleared < 0 || f.cleared > WAVES.CAP) return false;
  if (f.earlyCalls > f.cleared) return false;
  // Overtime boss waves past GOAL+5 send two bosses.
  const bossWaves = Math.floor((f.cleared + 1) / BOSS_EVERY);
  if (f.bossesKilled > bossWaves * 2) return false;
  if (f.maxTier < 0 || f.maxTier > 2) return false;
  if (f.integrityLost < 0 || f.integrityLost > ECONOMY.START_INTEGRITY) return false;
  if (new Set(f.typesBuilt).size !== f.typesBuilt.length) return false;
  if (f.typesBuilt.some((t) => !(t in TOWERS))) return false;
  const maxIncomePerWave = 8 * (TOWERS.BIOBANK.tiers[2].income ?? 0);
  if (f.biobankIncome > maxIncomePerWave * f.cleared) return false;
  return true;
}

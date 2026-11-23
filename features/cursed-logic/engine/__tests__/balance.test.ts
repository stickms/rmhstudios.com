/**
 * The balance claims of `docs/cursed-logic/balance.md`, asserted on a seeded simulation of the real run code
 * (`engine/sim.ts` drives `engine/run.ts`). Deterministic: same seeds, same numbers. If a number in `data.ts`
 * changes and this fails, re-measure and update the doc's table with the claim.
 */
import { describe, expect, it } from 'vitest';
import { STANCES } from '../data';
import { MAX_RUN_SCORE } from '../score';
import { simulateDuel, simulateRun, type AgentOptions, type Strategy } from '../sim';
import type { PactId, ProtocolId, Stance } from '../types';
import catalog from '../../catalog';

const RUNS = 160;

function runStats(strategy: Strategy, pacts: PactId[] = [], seed = 1000) {
  let wins = 0;
  let duels = 0;
  let maxScore = 0;
  for (let i = 0; i < RUNS; i++) {
    const o = simulateRun(seed + i, { strategy }, pacts);
    wins += o.victory ? 1 : 0;
    duels += o.duelsWon;
    maxScore = Math.max(maxScore, o.score);
  }
  return { winRate: wins / RUNS, meanDuels: duels / RUNS, maxScore };
}

function duelWinRate(protocols: readonly ProtocolId[], opts: AgentOptions, n: number, sector = 3, integrity = 10) {
  let w = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    for (const p of protocols) {
      w += simulateDuel(5000 + i, p, p === 'nullroot' ? 5 : sector, integrity, opts).won ? 1 : 0;
      total++;
    }
  }
  return w / total;
}

describe('Cursed Logic balance (seeded simulation)', () => {
  const reader = runStats('reader');
  const believer = runStats('believer');
  const striker = runStats('striker');
  const random = runStats('random');
  const turtle = runStats('turtle');

  it('a perfect reader clears the ladder often but not always', () => {
    expect(reader.winRate).toBeGreaterThan(0.5);
    expect(reader.winRate).toBeLessThan(0.9);
  });

  it('strategies order as intended: reader > believer > always-Strike > random, and always-Block wins nothing', () => {
    expect(reader.winRate).toBeGreaterThan(believer.winRate);
    expect(believer.winRate).toBeGreaterThan(striker.winRate + 0.3);
    expect(striker.winRate).toBeLessThan(0.15);
    expect(striker.meanDuels).toBeGreaterThan(random.meanDuels);
    expect(random.winRate).toBe(0);
    expect(random.meanDuels).toBeLessThan(1.5);
    expect(turtle.meanDuels).toBeLessThan(0.1);
  });

  const STANCE_FOES: ProtocolId[] = ['berserk', 'liar', 'leech', 'oracle'];
  const single = new Map<Stance, number>(
    STANCES.map((s) => [s, duelWinRate(STANCE_FOES, { strategy: 'reader', forceStance: s }, 100)]),
  );

  it('no stance dominates: forced every round, all twelve stay within 12 points of each other', () => {
    const rates = [...single.values()];
    const spread = Math.max(...rates) - Math.min(...rates);
    expect(spread, JSON.stringify(Object.fromEntries(single))).toBeLessThanOrEqual(0.12);
    for (const r of rates) {
      expect(r).toBeGreaterThan(0.6);
      expect(r).toBeLessThan(0.92);
    }
  });

  it('no stance pair dominates: alternating any two, every pair stays within 12 points of the mean', () => {
    const rates: number[] = [];
    for (let a = 0; a < STANCES.length; a++) {
      for (let b = a + 1; b < STANCES.length; b++) {
        const pair: [Stance, Stance] = [STANCES[a]!, STANCES[b]!];
        rates.push(duelWinRate(['liar', 'leech', 'oracle'], { strategy: 'reader', stancePair: pair }, 60));
      }
    }
    expect(rates).toHaveLength(66);
    const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
    const worst = Math.max(...rates.map((r) => Math.abs(r - mean)));
    expect(worst, `mean ${mean.toFixed(3)}`).toBeLessThanOrEqual(0.12);
  });

  it('tells matter: trusting every tell costs a lot against the Liar and next to nothing against the Warden', () => {
    const readerLiar = duelWinRate(['liar'], { strategy: 'reader' }, 200);
    const believerLiar = duelWinRate(['liar'], { strategy: 'believer' }, 200);
    const readerWarden = duelWinRate(['warden'], { strategy: 'reader' }, 200);
    const believerWarden = duelWinRate(['warden'], { strategy: 'believer' }, 200);
    expect(readerLiar - believerLiar).toBeGreaterThanOrEqual(0.05);
    expect(Math.abs(readerWarden - believerWarden)).toBeLessThanOrEqual(0.05);
  });

  it('NULL//ROOT is the hardest duel in the roster', () => {
    const boss = duelWinRate(['nullroot'], { strategy: 'reader' }, 150);
    for (const p of ['warden', 'mimic', 'berserk', 'liar', 'leech', 'oracle'] as const) {
      expect(duelWinRate([p], { strategy: 'reader' }, 150)).toBeGreaterThan(boss);
    }
    expect(boss).toBeGreaterThan(0.3);
  });

  it('pacts are a real handicap, and no simulated run reaches the score ceiling', () => {
    const all = runStats('reader', ['chaosRun', 'glassCannon', 'doubleDown', 'blackout']);
    expect(all.winRate).toBeLessThan(reader.winRate);
    const best = Math.max(reader.maxScore, all.maxScore, believer.maxScore);
    expect(best).toBeLessThan(MAX_RUN_SCORE);
    expect(MAX_RUN_SCORE).toBeLessThanOrEqual(catalog.scoring!.maxScore);
  });
});

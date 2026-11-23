/**
 * Signal Forge balance claims (docs/signal-forge/balance.md). Seeded, so a failure is a real change in
 * balance, not noise. If you retune a number and a band breaks, update the band AND the table in the doc.
 */
import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/cards';
import { cardBudget, cardPower, maxPossibleScore, POWER } from '../balance';
import { simulateRun, type SimOptions } from '../sim';
import catalog from '../../catalog';

const N = 120;

function rate(o: Omit<SimOptions, 'seed'>): { win: number; floor: number; maxScore: number } {
  let wins = 0;
  let floors = 0;
  let maxScore = 0;
  for (let s = 1; s <= N; s++) {
    const r = simulateRun({ ...o, seed: s * 101 });
    if (r.won) wins++;
    floors += r.floor;
    maxScore = Math.max(maxScore, r.score);
  }
  return { win: wins / N, floor: floors / N, maxScore };
}

describe('card-power budget', () => {
  const playable = CARDS.filter((c) => c.rarity !== 'starter' && c.rarity !== 'glitch');
  it.each(playable.map((c) => [c.id, c] as const))('%s sits inside its cost-and-rarity band', (_id, c) => {
    const power = cardPower(c);
    const budget = cardBudget(c);
    expect(power).toBeGreaterThanOrEqual(budget * POWER.bandLow);
    expect(power).toBeLessThanOrEqual(budget * POWER.bandHigh);
  });

  it('starter cards are below the common band (rewards must be upgrades)', () => {
    for (const c of CARDS.filter((x) => x.rarity === 'starter')) {
      expect(cardPower(c)).toBeLessThanOrEqual(cardBudget({ ...c, rarity: 'common' }));
    }
  });
});

describe('seeded run simulation', () => {
  const random = rate({ agent: 'random', ascension: 0 });
  const greedy0 = rate({ agent: 'greedy', ascension: 0 });
  const greedy5 = rate({ agent: 'greedy', ascension: 5 });
  const greedy10 = rate({ agent: 'greedy', ascension: 10 });
  const timedSkilled = rate({ agent: 'greedy', ascension: 0, mode: 'timed', perfectRate: 0.6, goodRate: 0.3 });
  const timedSloppy = rate({ agent: 'greedy', ascension: 0, mode: 'timed', perfectRate: 0.1, goodRate: 0.3 });

  it('a random agent almost never wins and dies early (choices matter)', () => {
    expect(random.win).toBeLessThanOrEqual(0.02);
    expect(random.floor).toBeLessThan(9);
  });

  it('a greedy agent at Ascension 0 wins a fair share, but not most runs', () => {
    expect(greedy0.win).toBeGreaterThanOrEqual(0.2);
    expect(greedy0.win).toBeLessThanOrEqual(0.45);
  });

  it('each ascension band is harder than the last', () => {
    expect(greedy5.win).toBeLessThan(greedy0.win);
    expect(greedy10.win).toBeLessThan(greedy5.win);
    expect(greedy10.win).toBeLessThanOrEqual(0.15);
    expect(greedy10.floor).toBeLessThan(greedy0.floor);
  });

  it('timing matters: landing Perfects beats Steady mode by at least 5 points', () => {
    expect(timedSkilled.win - greedy0.win).toBeGreaterThanOrEqual(0.05);
  });

  it('Steady mode is not a penalty next to sloppy timing (within 10 points)', () => {
    expect(Math.abs(timedSloppy.win - greedy0.win)).toBeLessThanOrEqual(0.1);
  });

  it('no simulated score exceeds the analytic ceiling, which the catalog ceiling covers', () => {
    const observed = Math.max(random.maxScore, greedy0.maxScore, greedy5.maxScore, greedy10.maxScore, timedSkilled.maxScore);
    expect(observed).toBeLessThanOrEqual(maxPossibleScore());
    expect(maxPossibleScore()).toBeLessThanOrEqual(catalog.scoring!.maxScore);
  });
});

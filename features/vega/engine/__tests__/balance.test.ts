/**
 * Project Vega's balance claims, checked by seeded simulation (docs/vega/balance.md records the table).
 *
 * Three scripted players (./strategies.ts) play every map with six seeds, never calling a wave early:
 *   - balanced: the opening a careful player builds, then upgrades and a rotation that answers each specimen;
 *   - greedy: the same, but every other build phase pays the biobanks first;
 *   - spam: Synapses only.
 *
 * Claims: on every map, balanced outlasts greedy, which outlasts spam (mean waves cleared); spam stalls in the
 * teens (it cannot see the cloaked Paranoia and cannot crack the armoured boss); balanced, the median player,
 * reaches the mid waves but not containment (wave 40), which takes early calls and better play than a script.
 */
import { describe, expect, it } from 'vitest';
import catalog from '../../catalog';
import { MAP_ORDER, WAVES, type MapId } from '../data';
import { Simulation } from '../Simulation';
import { maxScoreThrough, scoreCeiling } from '../scoring';
import { composeWave } from '../WaveManager';
import { runStrategy, type RunResult, type StrategyName } from './strategies';

const SEEDS = [1, 2, 3, 4, 5, 6];
const STRATS: StrategyName[] = ['balanced', 'greedy', 'spam'];

const results = new Map<string, RunResult[]>();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function runs(map: MapId, s: StrategyName): RunResult[] {
  const k = `${map}:${s}`;
  let r = results.get(k);
  if (!r) results.set(k, (r = SEEDS.map((seed) => runStrategy(Simulation, map, seed, s))));
  return r;
}

describe('vega balance (seeded simulation)', () => {
  it('prints the table recorded in docs/vega/balance.md', () => {
    const rows: string[] = [];
    for (const map of MAP_ORDER) {
      for (const s of STRATS) {
        const waves = runs(map, s).map((r) => r.cleared);
        rows.push(
          `${map.padEnd(8)} ${s.padEnd(9)} mean ${mean(waves).toFixed(1).padStart(5)}  min ${Math.min(...waves)}  max ${Math.max(...waves)}  [${waves.join(' ')}]`,
        );
      }
    }
    process.stdout.write(`${rows.join('\n')}\n`);
    expect(rows).toHaveLength(9);
  }, 300_000);

  for (const map of MAP_ORDER) {
    it(`${map}: balanced beats greedy beats spam`, () => {
      const b = mean(runs(map, 'balanced').map((r) => r.cleared));
      const g = mean(runs(map, 'greedy').map((r) => r.cleared));
      const s = mean(runs(map, 'spam').map((r) => r.cleared));
      expect(b).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(s);
    }, 300_000);

    it(`${map}: spam stalls in the teens; balanced reaches the mid waves but not containment`, () => {
      const s = runs(map, 'spam').map((r) => r.cleared);
      expect(mean(s)).toBeGreaterThanOrEqual(12);
      expect(mean(s)).toBeLessThanOrEqual(20);
      const b = runs(map, 'balanced').map((r) => r.cleared);
      expect(mean(b)).toBeGreaterThanOrEqual(24);
      expect(mean(b)).toBeLessThan(WAVES.GOAL);
    }, 300_000);
  }

  it('is deterministic for a seed', () => {
    const a = runStrategy(Simulation, 'intake', 9, 'balanced', 12);
    const b = runStrategy(Simulation, 'intake', 9, 'balanced', 12);
    expect(a).toEqual(b);
  });
});

describe('vega scoring ceilings', () => {
  it('the catalog maxScore covers a perfect run to the wave cap on the hardest-scoring map', () => {
    expect(catalog.scoring!.maxScore).toBeGreaterThanOrEqual(scoreCeiling());
    expect(catalog.scoring!.maxProgress).toBe(WAVES.CAP);
  });

  it('every simulated run scored within the per-wave bound the score route enforces', () => {
    for (const [k, rs] of results) {
      const map = k.split(':')[0] as MapId;
      for (const r of rs) expect(r.score).toBeLessThanOrEqual(maxScoreThrough(r.cleared, map));
    }
  });

  it('maxScorePerSecond covers the fastest possible run (every wave called the moment spawning ends, at 2x)', () => {
    // Score is only paid on a wave's clear, and a wave cannot clear before its last spawn; the next can be
    // called once the previous has finished spawning. So the shortest wall time to have cleared W waves is at
    // least the sum of their spawn durations, halved by the 2x speed control. A run is also never shorter than
    // the first wave's spawn time.
    let worst = 0;
    for (const map of MAP_ORDER) {
      const lanes = map === 'theatre' ? 2 : 1;
      let t = 0;
      for (let w = 1; w <= WAVES.CAP; w++) {
        // The run seed changes the mix; take the quickest-spawning mix of 50 seeds for every wave.
        let quickest = Infinity;
        for (let seed = 0; seed < 50; seed++) quickest = Math.min(quickest, composeWave(w, lanes, seed).duration);
        t += quickest;
        worst = Math.max(worst, maxScoreThrough(w, map) / Math.max(1, t / 2));
      }
    }
    process.stdout.write(`worst-case score per second ${worst.toFixed(1)}\n`);
    expect(catalog.scoring!.maxScorePerSecond).toBeGreaterThanOrEqual(worst);
  });
});

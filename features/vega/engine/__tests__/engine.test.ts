import { describe, expect, it } from 'vitest';
import { MAPS, MAP_ORDER, TOWERS, WAVES } from '../data';
import { GridManager } from '../GridManager';
import { plausibleFacts, vegaAchievementsFor, type VegaRunFacts } from '../achievements';
import { Simulation } from '../Simulation';
import { bossFor, composeWave } from '../WaveManager';

describe('vega maps', () => {
  for (const id of MAP_ORDER) {
    it(`${id}: the routes walk every corridor cell (no shortcut, no dead end)`, () => {
      const grid = new GridManager(MAPS[id]);
      const corridor = MAPS[id].layout.join('').replace(/[^#SE]/g, '').length;
      const walked = new Set(grid.lanes.flatMap((l) => l.cells.map((c) => `${c.x},${c.y}`)));
      expect(walked.size).toBe(corridor);
      expect(grid.benches().length).toBeGreaterThan(100);
    });
  }
});

describe('vega waves', () => {
  it('sends a boss every fifth wave, cycling Patient, Surgeon, Specimen', () => {
    expect([5, 10, 15, 20].map(bossFor)).toEqual(['PATIENT', 'SURGEON', 'SPECIMEN', 'PATIENT']);
    expect(bossFor(7)).toBeNull();
    expect(composeWave(10, 1, 3).spawns.some((s) => s.type === 'SURGEON')).toBe(true);
  });

  it('is deterministic per seed and leads with the specimen it introduces', () => {
    expect(composeWave(9, 2, 4)).toEqual(composeWave(9, 2, 4));
    expect(composeWave(9, 1, 4).spawns[0]!.type).toBe('PARANOIA');
  });
});

describe('vega simulation', () => {
  it('pays for builds and upgrades, refunds 70% on sale, and refuses what it cannot afford', () => {
    const sim = new Simulation('intake', 1);
    const bench = sim.grid.benches()[0]!;
    expect(sim.place('LOBOTOMIZER', bench.x, bench.y).ok).toBe(true);
    expect(sim.serum).toBe(260 - TOWERS.LOBOTOMIZER.tiers[0].cost);
    const t = sim.entities.towers[0]!;
    expect(sim.upgrade(t)).toEqual({ ok: false, reason: 'funds' });
    expect(sim.place('SYNAPSE', bench.x, bench.y)).toEqual({ ok: false, reason: 'blocked' });
    sim.sell(t);
    expect(sim.serum).toBe(260 - 170 + Math.floor(170 * 0.7));
  });

  it('round-trips a build-phase save', () => {
    const sim = new Simulation('theatre', 5);
    sim.place('SYNAPSE', 2, 1);
    const save = sim.save(1234)!;
    const back = Simulation.restore(JSON.parse(JSON.stringify(save)));
    expect(back.save(1234)).toEqual(save);
  });
});

describe('vega achievements', () => {
  const base: VegaRunFacts = {
    map: 'intake',
    cleared: 0,
    integrityLost: 0,
    typesBuilt: [],
    maxTier: 0,
    earlyCalls: 0,
    bossesKilled: 0,
    biobankIncome: 0,
  };

  it('awards containment per map and flawless only with no integrity lost', () => {
    const ids = vegaAchievementsFor({ ...base, map: 'theatre', cleared: WAVES.GOAL, typesBuilt: ['SYNAPSE', 'ECHO'] });
    expect(ids).toContain('game.vega.containment');
    expect(ids).toContain('game.vega.theatre_containment');
    expect(ids).toContain('game.vega.flawless');
    expect(vegaAchievementsFor({ ...base, cleared: WAVES.GOAL, integrityLost: 1 })).not.toContain('game.vega.flawless');
  });

  it('rejects facts no run could produce', () => {
    expect(plausibleFacts({ ...base, cleared: 3, earlyCalls: 5 })).toBe(false);
    expect(plausibleFacts({ ...base, cleared: 4, bossesKilled: 1 })).toBe(true);
    expect(plausibleFacts({ ...base, cleared: 3, bossesKilled: 1 })).toBe(false);
    expect(plausibleFacts({ ...base, cleared: 101 })).toBe(false);
    expect(plausibleFacts({ ...base, cleared: 2, biobankIncome: 99_999 })).toBe(false);
  });
});

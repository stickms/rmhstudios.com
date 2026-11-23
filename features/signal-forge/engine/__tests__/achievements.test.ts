import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import { SIGNAL_FORGE_ACHIEVEMENT_NAMES, SIGNAL_FORGE_ACHIEVEMENTS, signalForgeAchievementsForRun, type SignalForgeRunFacts } from '../achievements';

const base: SignalForgeRunFacts = {
  won: false, act: 1, ascension: 0, mode: 'steady', bursts: 0, perfects: 0, maxHit: 0, elitesWon: 0, bossesWon: 0, deckSize: 20, hpLeft: 0,
};

describe('Signal Forge achievements', () => {
  it('every id is in the catalog under the Signal Forge group, 10 to 15 of them', () => {
    const ids = Object.values(SIGNAL_FORGE_ACHIEVEMENTS);
    const group = ACHIEVEMENTS.filter((a) => a.group === 'Signal Forge').map((a) => a.id);
    expect(group.sort()).toEqual([...ids].sort());
    expect(ids.length).toBeGreaterThanOrEqual(10);
    expect(ids.length).toBeLessThanOrEqual(15);
  });

  it('a lost first run earns only the first one', () => {
    expect(signalForgeAchievementsForRun(base)).toEqual([SIGNAL_FORGE_ACHIEVEMENTS.firstRun]);
  });

  it('a timed A10 lean close win earns the winning set', () => {
    const ids = signalForgeAchievementsForRun({ ...base, won: true, act: 3, ascension: 10, mode: 'timed', bossesWon: 3, deckSize: 14, hpLeft: 3, perfects: 60, bursts: 30, maxHit: 70, elitesWon: 5 });
    expect(ids).toEqual(expect.arrayContaining(Object.values(SIGNAL_FORGE_ACHIEVEMENTS)));
  });

  it('the end-screen names match the catalog', () => {
    for (const [id, name] of Object.entries(SIGNAL_FORGE_ACHIEVEMENT_NAMES)) {
      expect(ACHIEVEMENTS.find((a) => a.id === id)?.name).toBe(name);
    }
  });

  it('Perfects only count in timed mode', () => {
    expect(signalForgeAchievementsForRun({ ...base, perfects: 99 })).not.toContain(SIGNAL_FORGE_ACHIEVEMENTS.perfect50);
  });
});

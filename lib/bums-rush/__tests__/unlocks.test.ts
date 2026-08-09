/**
 * Bum's Rush — the §11.2 unlock table.
 *
 * Two properties matter most: the table is **total** (every id it can grant
 * is a real cosmetic — no typo unlocks something that does not exist) and
 * **monotonic** (more progress never takes a cosmetic away). Everything else
 * here pins specific rows from the design doc's table so a future edit that
 * silently drops one is caught.
 */
import { describe, expect, it } from 'vitest';
import { ALL_COSMETIC_IDS } from '@/lib/bums-rush/cosmetics';
import {
  CAMPAIGN_LEVEL_COUNT,
  LEVELS_PER_WORLD,
  PARCEL_TOTAL,
  REACHABLE_COSMETIC_IDS,
  UNLOCK_RULES,
  evaluateUnlocks,
  newlyUnlocked,
  worldOfLevel,
  type UnlockProgress,
} from '@/lib/bums-rush/progress/unlocks';

function emptyProgress(overrides: Partial<UnlockProgress> = {}): UnlockProgress {
  return {
    clearedLevels: new Map(),
    parcelsFound: [],
    posesFound: [],
    recipesMade: [],
    levelsCleared: 0,
    showdownWins: 0,
    showdownLosses: 0,
    ...overrides,
  };
}

/** A progress snapshot where world `world` is fully cleared, objectives optionally full. */
function worldClearedProgress(world: number, fullObjectives: boolean): UnlockProgress {
  const clearedLevels = new Map<string, number>();
  for (let i = 1; i <= LEVELS_PER_WORLD; i++) {
    const id = `w${world}-${String(i).padStart(2, '0')}`;
    clearedLevels.set(id, fullObjectives ? 0b111 : 0);
  }
  return emptyProgress({ clearedLevels, levelsCleared: LEVELS_PER_WORLD });
}

describe("Bum's Rush unlock table (§11.2)", () => {
  it('is total: every grant is a real cosmetic id', () => {
    for (const rule of UNLOCK_RULES) {
      for (const id of rule.grants) expect(ALL_COSMETIC_IDS.has(id)).toBe(true);
    }
  });

  it('is exhaustive: every cosmetic in the catalog is reachable by some rule', () => {
    expect(REACHABLE_COSMETIC_IDS.size).toBe(ALL_COSMETIC_IDS.size);
    for (const id of ALL_COSMETIC_IDS) expect(REACHABLE_COSMETIC_IDS.has(id)).toBe(true);
  });

  it('worldOfLevel parses the "w<world>-<index>" convention and rejects everything else', () => {
    expect(worldOfLevel('w3-07')).toBe(3);
    expect(worldOfLevel('w1-01')).toBe(1);
    expect(worldOfLevel('w8-09')).toBe(8);
    expect(worldOfLevel('w9-01')).toBeNull(); // only 8 worlds exist
    expect(worldOfLevel('bogus')).toBeNull();
  });

  it('grants exactly the §11.2 "first launch" set on empty progress', () => {
    const unlocked = evaluateUnlocks(emptyProgress());
    expect(unlocked).toEqual(
      [
        ...new Set([
          'biro',
          'eraser',
          'sharpener',
          'mitten',
          'seat-1',
          'seat-2',
          'seat-3',
          'seat-4',
        ]),
      ].sort(),
    );
  });

  it("clearing every level in a world grants that world's head, not its hat set", () => {
    const unlocked = evaluateUnlocks(worldClearedProgress(1, false));
    expect(unlocked).toContain('staple'); // §2.4 row 4: clear world 1
    expect(unlocked).not.toContain('party-hat'); // needs ALL objectives, not just clears
  });

  it('all objectives in world 1 additionally grants the Paper Plane head', () => {
    const unlocked = evaluateUnlocks(worldClearedProgress(1, true));
    expect(unlocked).toContain('paper-plane');
    expect(unlocked).toContain('party-hat');
    expect(unlocked).toContain('chefs-toque');
    expect(unlocked).toContain('colander');
  });

  it("all objectives in world 2 grants that world's hat set but not Paper Plane", () => {
    const unlocked = evaluateUnlocks(worldClearedProgress(2, true));
    expect(unlocked).toContain('traffic-cone');
    expect(unlocked).toContain('snorkel');
    expect(unlocked).toContain('sticky-note');
    expect(unlocked).not.toContain('paper-plane');
  });

  it('12 recipes grants Whisk, 20 poses grants Lightbulb, 30 parcels grants Inkpot', () => {
    expect(
      evaluateUnlocks(
        emptyProgress({ recipesMade: Array.from({ length: 12 }, (_, i) => `r${i}`) }),
      ),
    ).toContain('whisk');
    expect(
      evaluateUnlocks(
        emptyProgress({ recipesMade: Array.from({ length: 11 }, (_, i) => `r${i}`) }),
      ),
    ).not.toContain('whisk');
    expect(
      evaluateUnlocks(emptyProgress({ posesFound: Array.from({ length: 20 }, (_, i) => `p${i}`) })),
    ).toContain('lightbulb');
    expect(
      evaluateUnlocks(
        emptyProgress({ parcelsFound: Array.from({ length: 30 }, (_, i) => `parcel-${i}`) }),
      ),
    ).toContain('inkpot');
  });

  it('10/25/50/72 levels cleared grant the milestone hat/gloves/ink/hat, at the exact boundary', () => {
    expect(evaluateUnlocks(emptyProgress({ levelsCleared: 9 }))).not.toContain('sticky-note');
    expect(evaluateUnlocks(emptyProgress({ levelsCleared: 10 }))).toContain('sticky-note');
    expect(evaluateUnlocks(emptyProgress({ levelsCleared: 25 }))).toContain('bubble-wrap');
    expect(evaluateUnlocks(emptyProgress({ levelsCleared: 50 }))).toContain('highlighter-yellow');
    expect(evaluateUnlocks(emptyProgress({ levelsCleared: CAMPAIGN_LEVEL_COUNT }))).toContain(
      'halo',
    );
  });

  it('first Showdown match (a loss counts) grants boxing gloves; 25 wins grants the bent crown', () => {
    expect(evaluateUnlocks(emptyProgress({ showdownWins: 0, showdownLosses: 1 }))).toContain(
      'boxing-glove',
    );
    expect(evaluateUnlocks(emptyProgress({ showdownWins: 0, showdownLosses: 0 }))).not.toContain(
      'boxing-glove',
    );
    expect(evaluateUnlocks(emptyProgress({ showdownWins: 24 }))).not.toContain('crown-bent');
    expect(evaluateUnlocks(emptyProgress({ showdownWins: 25 }))).toContain('crown-bent');
  });

  it('100% campaign requires all three of levels, objectives and parcels — not any one alone', () => {
    const parcelsFound = Array.from({ length: PARCEL_TOTAL }, (_, i) => `parcel-${i}`);
    const clearedLevels = new Map<string, number>();
    for (let w = 1; w <= 8; w++) {
      for (let i = 1; i <= LEVELS_PER_WORLD; i++)
        clearedLevels.set(`w${w}-${String(i).padStart(2, '0')}`, 0b111);
    }

    const complete = emptyProgress({
      clearedLevels,
      levelsCleared: CAMPAIGN_LEVEL_COUNT,
      parcelsFound,
    });
    expect(evaluateUnlocks(complete)).toContain('inkblot');
    expect(evaluateUnlocks(complete)).toContain('gold-ink');

    // Levels and objectives complete, but parcels short — no 100% reward yet.
    const missingParcels = emptyProgress({
      clearedLevels,
      levelsCleared: CAMPAIGN_LEVEL_COUNT,
      parcelsFound: [],
    });
    expect(evaluateUnlocks(missingParcels)).not.toContain('inkblot');
  });

  it('parcels found unlock the fixed parcel-reward sequence in order', () => {
    const one = evaluateUnlocks(emptyProgress({ parcelsFound: ['p1'] }));
    expect(one).toContain('oven-mitt');
    expect(one).not.toContain('rubber-glove');

    const two = evaluateUnlocks(emptyProgress({ parcelsFound: ['p1', 'p2'] }));
    expect(two).toContain('oven-mitt');
    expect(two).toContain('rubber-glove');
  });

  it('is monotonic: strictly more progress never unlocks fewer cosmetics', () => {
    const less = worldClearedProgress(3, true);
    const more = emptyProgress({
      clearedLevels: less.clearedLevels,
      levelsCleared: 50,
      parcelsFound: Array.from({ length: 10 }, (_, i) => `parcel-${i}`),
      posesFound: less.posesFound,
      recipesMade: less.recipesMade,
      showdownWins: less.showdownWins,
      showdownLosses: less.showdownLosses,
    });

    const lessUnlocked = new Set(evaluateUnlocks(less));
    const moreUnlocked = new Set(evaluateUnlocks(more));
    for (const id of lessUnlocked) expect(moreUnlocked.has(id)).toBe(true);
  });

  it('evaluateUnlocks is pure and deterministic — the same progress always yields the same, stably-sorted result', () => {
    const progress = worldClearedProgress(4, true);
    const a = evaluateUnlocks(progress);
    const b = evaluateUnlocks(progress);
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort());
  });

  it('newlyUnlocked reports only what was not already owned', () => {
    const progress = worldClearedProgress(1, true);
    const all = evaluateUnlocks(progress);
    expect(newlyUnlocked(all, progress)).toEqual([]);
    expect(newlyUnlocked([], progress)).toEqual(all);
    expect(newlyUnlocked(['biro'], progress)).not.toContain('biro');
  });
});

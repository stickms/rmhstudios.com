/**
 * Bum's Rush — the server save path's two silent-failure defaults (#1336).
 *
 * Both lose a signed-in player's progress without any error: with no level-bounds
 * resolver installed every server clear was "unranked: level bounds unavailable"
 * and dropped, and a profile row created by a first clear reported an empty
 * unlock list (so the starter kit looked locked).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import { createDefaultProfile } from '@/lib/bums-rush/progress/save';
import { objectiveIdsToBitmask } from '@/lib/bums-rush/progress/objectives';
import { resolveBounds, toProfile } from '@/lib/bums-rush/progress/save.server';

describe('default level-bounds resolver', () => {
  it('resolves an authored level with nothing installed, so its clears are ranked', async () => {
    const bounds = await resolveBounds('w1-01');
    expect(bounds).not.toBeNull();
    expect(bounds!.parSeconds).toBe(45);
    expect(bounds!.objectives.map((o) => o.id)).toEqual(['w1-01-clock', 'w1-01-flawless', 'w1-01-photo']);
  });

  it('keeps an unknown or malformed level id unranked (null), never a guess', async () => {
    expect(await resolveBounds('w9-99')).toBeNull();
    expect(await resolveBounds('not-a-level')).toBeNull();
  });
});

describe('objective bitmask', () => {
  const objectives = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('uses the authored order as the bit position', () => {
    expect(objectiveIdsToBitmask([], objectives)).toBe(0);
    expect(objectiveIdsToBitmask(['a'], objectives)).toBe(0b001);
    expect(objectiveIdsToBitmask(['c', 'a'], objectives)).toBe(0b101);
    expect(objectiveIdsToBitmask(['zzz'], objectives)).toBe(0);
  });
});

describe('toProfile starter unlocks', () => {
  const row = {
    head: 'biro',
    hat: null,
    gloves: 'mitten',
    ink: 'seat-1',
    unlockedCosmetics: [] as string[],
    parcelsFound: [],
    posesFound: [],
    recipesMade: [],
    levelsCleared: 0,
    deaths: 0,
    metresSwung: 0,
    showdownRating: 1000,
    showdownWins: 0,
    showdownLosses: 0,
    settings: null,
    updatedAt: new Date(0),
    clears: [],
  };

  it('always includes the starter kit when the stored column is empty', () => {
    const profile = toProfile(row as never);
    for (const id of createDefaultProfile().unlockedCosmetics) {
      expect(profile.unlockedCosmetics).toContain(id);
    }
  });

  it('keeps earned unlocks and does not duplicate the starter kit', () => {
    const starter = createDefaultProfile().unlockedCosmetics;
    const profile = toProfile({ ...row, unlockedCosmetics: [...starter, 'extra-id'] } as never);
    expect(profile.unlockedCosmetics).toContain('extra-id');
    expect(new Set(profile.unlockedCosmetics).size).toBe(profile.unlockedCosmetics.length);
  });
});

import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import {
  ACHIEVEMENT_GROUP_BY_GAME_ID,
  UNMAPPED_ACHIEVEMENT_GROUPS,
  achievementsForTitle,
} from '@/lib/games/achievement-groups';
import { isTrackableTitle } from '@/lib/games/route-match';

describe('achievement groups', () => {
  const labels = [...new Set(ACHIEVEMENTS.map((a) => a.group).filter((g): g is string => !!g))];

  it('every group label maps to a title or is explicitly listed as unmapped', () => {
    // One-directional: when a group gains a title, delete it from the unmapped
    // list in the same commit. A new group in the catalog fails here until
    // somebody decides where it belongs.
    const mapped = new Set(Object.values(ACHIEVEMENT_GROUP_BY_GAME_ID));
    const orphans = labels.filter((l) => !mapped.has(l) && !UNMAPPED_ACHIEVEMENT_GROUPS.includes(l));
    expect(orphans).toEqual([]);
  });

  it('an unmapped group is not also mapped, and names a real catalog group', () => {
    const mapped = new Set(Object.values(ACHIEVEMENT_GROUP_BY_GAME_ID));
    for (const g of UNMAPPED_ACHIEVEMENT_GROUPS) {
      expect(mapped.has(g)).toBe(false);
      expect(labels).toContain(g);
    }
  });

  it('every mapped id is a real catalog title and every label is a real group', () => {
    for (const [id, label] of Object.entries(ACHIEVEMENT_GROUP_BY_GAME_ID)) {
      expect(isTrackableTitle(id), id).toBe(true);
      expect(labels, label).toContain(label);
    }
  });
});

describe('achievementsForTitle', () => {
  it("returns only the title's group", () => {
    const got = achievementsForTitle('slice-it', ACHIEVEMENTS);
    expect(got.length).toBe(9);
    expect(got.every((a) => a.group === 'Slice It!')).toBe(true);
  });

  it('returns nothing for a title with no group', () => {
    expect(achievementsForTitle('nightrail', ACHIEVEMENTS)).toEqual([]);
    expect(achievementsForTitle('no-such-title', ACHIEVEMENTS)).toEqual([]);
  });
});

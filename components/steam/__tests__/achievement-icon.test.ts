import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_ICON, DEFAULT_ACHIEVEMENT_ICON } from '@/lib/achievements/icons';
import { ACHIEVEMENT_ICON_COMPONENTS } from '@/components/steam/AchievementIcon';

describe('AchievementIcon', () => {
  it('resolves every icon name in the map (and the default) to a component', () => {
    const names = new Set([...Object.values(ACHIEVEMENT_ICON), DEFAULT_ACHIEVEMENT_ICON]);
    const unresolved = [...names].filter((n) => !ACHIEVEMENT_ICON_COMPONENTS[n]);
    expect(unresolved).toEqual([]);
  });

  it('carries no component the map never uses', () => {
    const names = new Set([...Object.values(ACHIEVEMENT_ICON), DEFAULT_ACHIEVEMENT_ICON]);
    expect(Object.keys(ACHIEVEMENT_ICON_COMPONENTS).filter((n) => !names.has(n))).toEqual([]);
  });
});

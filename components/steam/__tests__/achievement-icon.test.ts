import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_ACCENT,
  ACHIEVEMENT_ICON,
  DEFAULT_ACHIEVEMENT_ICON,
} from '@/lib/achievements/icons';
import { ACHIEVEMENT_ICON_COMPONENTS } from '@/components/steam/AchievementIcon';

const usedNames = () =>
  new Set([
    ...Object.values(ACHIEVEMENT_ICON),
    ...Object.values(ACHIEVEMENT_ACCENT),
    DEFAULT_ACHIEVEMENT_ICON,
  ]);

describe('AchievementIcon', () => {
  it('resolves every glyph and accent name (and the default) to a component', () => {
    const unresolved = [...usedNames()].filter((n) => !ACHIEVEMENT_ICON_COMPONENTS[n]);
    expect(unresolved).toEqual([]);
  });

  it('carries no component the maps never use', () => {
    const names = usedNames();
    expect(Object.keys(ACHIEVEMENT_ICON_COMPONENTS).filter((n) => !names.has(n))).toEqual([]);
  });
});

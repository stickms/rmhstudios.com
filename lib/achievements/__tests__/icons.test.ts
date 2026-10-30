import { describe, expect, it } from 'vitest';
import * as lucide from 'lucide-react';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import {
  ACHIEVEMENT_ICON,
  DEFAULT_ACHIEVEMENT_ICON,
  achievementIconName,
} from '@/lib/achievements/icons';

describe('achievement icons', () => {
  const icons = lucide as unknown as Record<string, unknown>;
  const isIcon = (name: string) =>
    typeof icons[name] === 'object' || typeof icons[name] === 'function';

  it('gives every achievement an icon', () => {
    const missing = ACHIEVEMENTS.filter((a) => !ACHIEVEMENT_ICON[a.id]).map((a) => a.id);
    expect(missing).toEqual([]);
  });

  it('only names icons that exist in lucide-react', () => {
    const unknown = Object.entries(ACHIEVEMENT_ICON)
      .filter(([, name]) => !isIcon(name))
      .map(([id, name]) => `${id}: ${name}`);
    expect(unknown).toEqual([]);
    expect(isIcon(DEFAULT_ACHIEVEMENT_ICON)).toBe(true);
  });

  it('has no entry for an achievement that no longer exists', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(Object.keys(ACHIEVEMENT_ICON).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('falls back to a trophy for an unknown id', () => {
    expect(achievementIconName('does.not.exist')).toBe('Trophy');
    expect(achievementIconName('game.altair.first_run')).toBe('Rocket');
  });
});

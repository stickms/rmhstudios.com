import { describe, expect, it } from 'vitest';
import * as lucide from 'lucide-react';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import {
  ACHIEVEMENT_ACCENT,
  ACHIEVEMENT_ICON,
  DEFAULT_ACHIEVEMENT_ICON,
  achievementAccentName,
  achievementIconName,
  achievementShape,
  compactCount,
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

  it('only accents with real lucide icons, for real achievements', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    const bad = Object.entries(ACHIEVEMENT_ACCENT)
      .filter(([id, name]) => !ids.has(id) || !isIcon(name))
      .map(([id, name]) => `${id}: ${name}`);
    expect(bad).toEqual([]);
    expect(achievementAccentName('game.altair.first_victory')).toBe('Crown');
    expect(achievementAccentName('social.posts_10')).toBeNull();
  });

  it('gives each category its own badge shape', () => {
    expect(achievementShape('social.first_post')).toBe('circle');
    expect(achievementShape('creator.first_build')).toBe('hex');
    expect(achievementShape('economy.coins_1000')).toBe('diamond');
    expect(achievementShape('special.streak_7')).toBe('shield');
    expect(achievementShape('game.altair.first_run')).toBe('square');
    expect(achievementShape('games.bums_cat')).toBe('square');
    expect(achievementShape('unknown.thing')).toBe('circle');
    // Every real achievement resolves to one of the five.
    for (const a of ACHIEVEMENTS) {
      expect(['circle', 'hex', 'diamond', 'shield', 'square']).toContain(achievementShape(a.id));
    }
  });
});

describe('compactCount', () => {
  it('writes milestone counts short enough for a ribbon', () => {
    expect(compactCount(10)).toBe('10');
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1000)).toBe('1K');
    expect(compactCount(1500)).toBe('1.5K');
    expect(compactCount(10000)).toBe('10K');
    expect(compactCount(5000)).toBe('5K');
  });
});

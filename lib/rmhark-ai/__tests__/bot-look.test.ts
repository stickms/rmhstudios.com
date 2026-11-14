import { describe, expect, it } from 'vitest';
import {
  REFRESH_MIN_AGE_MS,
  cartoonAvatarUrl,
  hourlyChance,
  initialsAvatarUrl,
  needsFirstUpdate,
  refreshPlan,
  rollAvatarKind,
} from '../bot-look';

const DRIFT = { avatarDays: 60, bannerDays: 90, bioDays: 45, nameDays: 180 };
const NOW = Date.UTC(2026, 10, 14);
const OLD = new Date(NOW - 30 * 24 * 60 * 60 * 1000);

describe('first update', () => {
  it('a DiceBear URL with no background still needs its first update; one this module made does not', () => {
    expect(needsFirstUpdate('https://api.dicebear.com/9.x/micah/svg?seed=sam')).toBe(true);
    expect(needsFirstUpdate(null)).toBe(true);
    expect(needsFirstUpdate(cartoonAvatarUrl('sam', 0.3, 0.5))).toBe(false);
    expect(needsFirstUpdate(initialsAvatarUrl('Sam Lee', 0.5))).toBe(false);
    expect(needsFirstUpdate('https://cdn.example.com/user-avatars/bot-1.webp')).toBe(false);
  });
});

describe('avatar mix', () => {
  it('rolls photo, cartoon and initials across the unit interval', () => {
    expect(rollAvatarKind(0)).toBe('photo');
    expect(rollAvatarKind(0.8)).toBe('cartoon');
    expect(rollAvatarKind(0.99)).toBe('initials');
  });
});

describe('refreshPlan', () => {
  const image = 'https://cdn.example.com/user-avatars/bot-1.webp';

  it('a bot in its first two weeks does not drift', () => {
    const young = new Date(NOW - REFRESH_MIN_AGE_MS + 1000);
    expect(refreshPlan({ createdAt: young, image }, DRIFT, NOW, () => 0)).toEqual({
      avatar: false,
      banner: false,
      bio: false,
      name: false,
    });
  });

  it('draws each field against 1 / (meanDays * 24)', () => {
    expect(hourlyChance(60)).toBeCloseTo(1 / 1440);
    expect(hourlyChance(0)).toBe(0);
    const under = refreshPlan({ createdAt: OLD, image }, DRIFT, NOW, () => 1 / 5000);
    expect(under).toEqual({ avatar: true, banner: true, bio: true, name: true });
    const over = refreshPlan({ createdAt: OLD, image }, DRIFT, NOW, () => 1 / 1000);
    expect(over).toEqual({ avatar: false, banner: false, bio: false, name: false });
  });
});

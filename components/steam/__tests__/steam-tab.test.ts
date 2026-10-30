import { describe, expect, it } from 'vitest';
import { steamTabFor } from '../SteamShell';

describe('steamTabFor', () => {
  it('maps library routes to the Library tab', () => {
    expect(steamTabFor('/games')).toBe('library');
    expect(steamTabFor('/games/altair')).toBe('library');
    expect(steamTabFor('/games/altair/guides/abc')).toBe('library');
  });

  it('maps community routes to Community, ahead of the Library prefix', () => {
    expect(steamTabFor('/games/community')).toBe('community');
    expect(steamTabFor('/games/profile/abc')).toBe('community');
    expect(steamTabFor('/games/groups/x')).toBe('community');
  });

  it('maps store and arcade, and ignores everything else', () => {
    expect(steamTabFor('/store')).toBe('store');
    expect(steamTabFor('/arcade')).toBe('arcade');
    expect(steamTabFor('/arcade/leaderboard')).toBe('arcade');
    expect(steamTabFor('/games-extra')).toBeNull();
    expect(steamTabFor('/')).toBeNull();
  });
});

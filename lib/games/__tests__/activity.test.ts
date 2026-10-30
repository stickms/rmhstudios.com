import { describe, expect, it } from 'vitest';
import { NOW_PLAYING_WINDOW_S, assembleActivity, isPlayingNow } from '../activity';

describe('isPlayingNow', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const at = (s: number) => new Date(now.getTime() - s * 1000);

  it('is true only for a heartbeat inside the window', () => {
    expect(isPlayingNow(at(10), now)).toBe(true);
    expect(isPlayingNow(at(NOW_PLAYING_WINDOW_S), now)).toBe(true);
    expect(isPlayingNow(at(NOW_PLAYING_WINDOW_S + 1), now)).toBe(false);
    expect(isPlayingNow(null, now)).toBe(false);
  });

  it('a heartbeat from the future (clock skew) still counts as now', () => {
    expect(isPlayingNow(at(-5), now)).toBe(true);
  });
});

const person = (id: string, privacy = 'public') => ({
  userId: id,
  handle: id,
  name: id.toUpperCase(),
  image: null,
  playtimePrivacy: privacy,
});
const base = (over: Partial<Parameters<typeof assembleActivity>[0]> = {}) => ({
  viewerId: 'me',
  people: new Map([['a', person('a')], ['b', person('b', 'private')], ['c', person('c', 'followers')]]),
  titles: new Map([['altair', 'Altair'], ['laundry-sort', 'Laundry Sort']]),
  achievementName: (id: string) => (id === 'x' ? 'Into the Black' : null),
  achievements: [],
  badges: [],
  reviews: [],
  threads: [],
  played: [],
  limit: 40,
  ...over,
});
const t = (h: number) => new Date(Date.UTC(2026, 9, 30, h));

describe('assembleActivity', () => {
  it('merges every source newest first and caps the list', () => {
    const ev = assembleActivity(
      base({
        achievements: [{ userId: 'a', achievementId: 'x', unlockedAt: t(3) }],
        badges: [{ userId: 'a', gameId: 'altair', foil: false, level: 2, craftedAt: t(5) }],
        reviews: [{ userId: 'a', gameId: 'altair', stars: 4, createdAt: t(4) }],
        threads: [{ userId: 'a', gameId: 'altair', id: 'th1', title: 'Hi', createdAt: t(6) }],
        limit: 3,
      }),
    );
    expect(ev.map((e) => e.kind)).toEqual(['thread', 'badge', 'review']);
  });

  it('drops events for titles the catalog no longer has and achievements it does not know', () => {
    const ev = assembleActivity(
      base({
        badges: [{ userId: 'a', gameId: 'gone', foil: false, level: 1, craftedAt: t(1) }],
        achievements: [{ userId: 'a', achievementId: 'unknown', unlockedAt: t(2) }],
      }),
    );
    expect(ev).toEqual([]);
  });

  it('shows achievements with their name and the badge level', () => {
    const [ach, badge] = assembleActivity(
      base({
        achievements: [{ userId: 'a', achievementId: 'x', unlockedAt: t(9) }],
        badges: [{ userId: 'a', gameId: 'altair', foil: false, level: 3, craftedAt: t(8) }],
      }),
    );
    expect(ach).toMatchObject({ kind: 'achievement', detail: 'Into the Black' });
    expect(badge).toMatchObject({ kind: 'badge', detail: 3, gameTitle: 'Altair' });
  });

  it('sums a week of playtime per person and title into one event, gated by privacy', () => {
    const ev = assembleActivity(
      base({
        played: [
          { userId: 'a', gameId: 'altair', day: t(0), seconds: 600 },
          { userId: 'a', gameId: 'altair', day: new Date(t(0).getTime() - 86_400_000), seconds: 900 },
          { userId: 'b', gameId: 'altair', day: t(0), seconds: 5000 }, // private: hidden
          { userId: 'c', gameId: 'laundry-sort', day: t(0), seconds: 1200 }, // followers: visible (a followed friend)
        ],
      }),
    );
    expect(ev.filter((e) => e.kind === 'played').map((e) => [e.user.userId, e.gameId, e.detail])).toEqual(
      expect.arrayContaining([
        ['a', 'altair', 1500],
        ['c', 'laundry-sort', 1200],
      ]),
    );
    expect(ev.some((e) => e.user.userId === 'b')).toBe(false);
  });

  it('a private player still shows non-playtime activity (it is public on their profile)', () => {
    const ev = assembleActivity(
      base({ reviews: [{ userId: 'b', gameId: 'altair', stars: 5, createdAt: t(2) }] }),
    );
    expect(ev).toHaveLength(1);
    expect(ev[0].user.userId).toBe('b');
  });

  it('ignores people it has no record of', () => {
    expect(
      assembleActivity(base({ reviews: [{ userId: 'zz', gameId: 'altair', stars: 5, createdAt: t(2) }] })),
    ).toEqual([]);
  });

  it('gives every event a stable unique id', () => {
    const ev = assembleActivity(
      base({
        reviews: [
          { userId: 'a', gameId: 'altair', stars: 4, createdAt: t(4) },
          { userId: 'a', gameId: 'laundry-sort', stars: 3, createdAt: t(4) },
        ],
      }),
    );
    expect(new Set(ev.map((e) => e.id)).size).toBe(2);
  });
});

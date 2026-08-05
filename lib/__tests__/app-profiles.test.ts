import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ─────────── the per-app profile reader (C9) ───────────
 *
 * `lib/profile/app-profiles.server.ts` is the one place that knows which table
 * backs which app's profile card. Three properties make it safe to call from a
 * public profile page, and all three are the kind that regress silently:
 *
 *  1. **A user with no row gets `null`, not a throw and not a zeroed card.**
 *     Every one of these tables is populated lazily — the row appears the first
 *     time you open the app. So "no row" is the NORMAL case for five of six
 *     apps on any given profile, and a reader that throws there turns the most
 *     common path into a 500.
 *  2. **The privacy predicate is applied by the accessor, not by the caller.**
 *     That is the whole point of putting `visible()` on the card: a new surface
 *     cannot forget a rule it never had to write. The owner-only cards must be
 *     absent for a stranger and for a signed-out viewer.
 *  3. **One failing table costs one card.** `Promise.allSettled`, not
 *     `Promise.all` — a locked stats table must not 500 the profile.
 */

const { db } = vi.hoisted(() => ({
  db: {
    rMHboxProfile: { findUnique: vi.fn() },
    rmhTypeProfile: { findMany: vi.fn() },
    rmhStudyProfile: { findUnique: vi.fn() },
    rmhTubeUserStats: { findUnique: vi.fn() },
    eloRating: { findMany: vi.fn() },
    doctrineReputation: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/prisma.server', () => ({ prisma: db }));

import {
  appProfile,
  appProfiles,
  appProfileIds,
  type AppProfileCard,
} from '@/lib/profile/app-profiles.server';

const OWNER = 'user_owner';
const STRANGER = 'user_stranger';

/** Every reader's "this user has never opened the app" answer. */
function noRows(): void {
  db.rMHboxProfile.findUnique.mockResolvedValue(null);
  db.rmhTypeProfile.findMany.mockResolvedValue([]);
  db.rmhStudyProfile.findUnique.mockResolvedValue(null);
  db.rmhTubeUserStats.findUnique.mockResolvedValue(null);
  db.eloRating.findMany.mockResolvedValue([]);
  db.doctrineReputation.findUnique.mockResolvedValue(null);
}

/** A populated row for every app, so all six cards are produced. */
function allRows(): void {
  db.rMHboxProfile.findUnique.mockResolvedValue({
    totalGamesPlayed: 42,
    totalWins: 17,
    totalScore: 9001,
    bestWinStreak: 5,
  });
  db.rmhTypeProfile.findMany.mockResolvedValue([
    { bestWpm: 71.4, bestAccuracy: 96.2, totalGamesPlayed: 10, totalWins: 3 },
    { bestWpm: 82.6, bestAccuracy: 91.8, totalGamesPlayed: 4, totalWins: 1 },
  ]);
  db.rmhStudyProfile.findUnique.mockResolvedValue({
    totalFocusTimeMs: 9_000_000n,
    sessionsCompleted: 12,
    currentStreak: 3,
    longestStreak: 8,
  });
  db.rmhTubeUserStats.findUnique.mockResolvedValue({
    totalWatchTimeMinutes: 195,
    videosWatched: 40,
    roomsCreated: 2,
    roomsJoined: 9,
  });
  db.eloRating.findMany.mockResolvedValue([
    { game: 'altair', rating: 1340, wins: 20, losses: 11, draws: 2 },
  ]);
  db.doctrineReputation.findUnique.mockResolvedValue({
    totalXp: 250,
    currentStreak: 4,
    longestStreak: 9,
    sahurCount: 1,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  noRows();
});

describe('a reader with no row returns null rather than throwing', () => {
  it('produces no cards at all for a brand-new account', async () => {
    await expect(appProfiles(OWNER, OWNER)).resolves.toEqual([]);
  });

  it('answers null for every single app id', async () => {
    // Asserted per id, not just on the aggregate: an empty array from
    // `appProfiles` would also be produced by a reader that throws, because the
    // accessor swallows rejections. This walks the registry so a reader added
    // later is covered without touching this test.
    for (const id of appProfileIds()) {
      await expect(appProfile(id, OWNER, OWNER), id).resolves.toBeNull();
    }
  });

  it('covers every app the module claims to read', () => {
    // Guards the loop above from passing vacuously if the registry is emptied.
    expect(appProfileIds().sort()).toEqual([
      'ranked',
      'rmh-strategies',
      'rmhbox',
      'rmhstudy',
      'rmhtube',
      'rmhtype',
    ]);
  });
});

describe('the privacy rule lives in the reader', () => {
  beforeEach(allRows);

  it('shows the owner everything', async () => {
    const cards = await appProfiles(OWNER, OWNER);
    expect(cards.map((c) => c.appId).sort()).toEqual([
      'ranked',
      'rmh-strategies',
      'rmhbox',
      'rmhstudy',
      'rmhtube',
      'rmhtype',
    ]);
  });

  it('hides the owner-only cards from a stranger', async () => {
    const ids = (await appProfiles(OWNER, STRANGER)).map((c) => c.appId);
    expect(ids).not.toContain('rmhtube');
    expect(ids).not.toContain('rmh-strategies');
    expect(ids.sort()).toEqual(['ranked', 'rmhbox', 'rmhstudy', 'rmhtype']);
  });

  it('hides the owner-only cards from a signed-out viewer', async () => {
    // The null viewer is the case a hand-rolled `viewerId === ownerId` check
    // gets right by accident and a `viewerId !== ownerId` check gets wrong.
    const ids = (await appProfiles(OWNER)).map((c) => c.appId);
    expect(ids).not.toContain('rmhtube');
    expect(ids).not.toContain('rmh-strategies');
  });

  it('applies the same rule to the single-app accessor', async () => {
    await expect(appProfile('rmhtube', OWNER, OWNER)).resolves.not.toBeNull();
    await expect(appProfile('rmhtube', OWNER, STRANGER)).resolves.toBeNull();
    await expect(appProfile('rmhtube', OWNER)).resolves.toBeNull();
  });

  it('does not resolve inherited object properties as readers', async () => {
    // `appId` comes off a URL. A bare index would return
    // `Object.prototype.constructor` here — truthy, and a throw when called.
    await expect(appProfile('constructor', OWNER, OWNER)).resolves.toBeNull();
    await expect(appProfile('toString', OWNER, OWNER)).resolves.toBeNull();
  });
});

describe('one failing table costs one card', () => {
  it('drops the failing app and keeps the rest', async () => {
    allRows();
    db.rmhTubeUserStats.findUnique.mockRejectedValue(new Error('relation is locked'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ids = (await appProfiles(OWNER, OWNER)).map((c) => c.appId);
    expect(ids).not.toContain('rmhtube');
    expect(ids.length).toBe(5);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('card shape', () => {
  beforeEach(allRows);

  it('carries translation keys and interpolation values, never rendered prose', async () => {
    // A server module has no request locale. If a reader ever formats English
    // into `headline`, fifteen locales silently serve English — and nothing
    // else in the pipeline would notice.
    const cards = await appProfiles(OWNER, OWNER);
    for (const card of cards) {
      expect(card.headline.key, card.appId).toMatch(/^app-profile\./);
      expect(card.headline.defaultValue, card.appId).toBeTruthy();
      for (const stat of card.stats) {
        expect(stat.labelKey, `${card.appId}/${stat.labelKey}`).toMatch(/^app-profile\./);
        expect(stat.labelDefault, `${card.appId}/${stat.labelKey}`).toBeTruthy();
      }
    }
  });

  it('links every card at a route that exists', async () => {
    const cards = await appProfiles(OWNER, OWNER);
    for (const card of cards) {
      expect(card.href, card.appId).toMatch(/^\/[a-z0-9/-]*$/);
    }
  });

  it('folds RMHType across difficulties instead of picking one', async () => {
    // Two rows, one per difficulty. A reader that took `findFirst` would report
    // 71 WPM for a player whose best is 83.
    const card = (await appProfile('rmhtype', OWNER, OWNER)) as AppProfileCard;
    expect(card.headline.vars).toEqual({ wpm: 83 });
    expect(card.stats.find((s) => s.labelKey === 'app-profile.races')?.value).toBe(14);
  });

  it('reads the BigInt focus column without leaking a BigInt into the card', async () => {
    // 9,000,000 ms is 2.5 hours. A BigInt here would throw on JSON.stringify at
    // whatever route eventually serialises the card.
    const card = (await appProfile('rmhstudy', OWNER, OWNER)) as AppProfileCard;
    expect(card.headline.vars).toEqual({ hours: 2 });
    expect(JSON.stringify(card.headline)).toContain('"hours":2');
  });
});

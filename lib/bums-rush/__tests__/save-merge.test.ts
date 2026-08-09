/**
 * Bum's Rush — the §10.4 merge policy.
 *
 * This is "the part that must not be wrong" (the ticket's own words): a bad
 * merge eats a player's progress. Every field's rule is exercised on its own,
 * plus the two properties that matter more than any single field —
 * idempotency (merging twice must equal merging once) and monotonicity
 * (merging never loses a record either side already had).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSISTS, DEFAULT_COSMETICS } from '@/lib/bums-rush/constants';
import type { GameSettings, LevelClear, Profile } from '@/lib/bums-rush/types';
import { clearKey, mergeProfiles } from '@/lib/bums-rush/progress/merge';

function settings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    assists: { ...DEFAULT_ASSISTS },
    music: 0.7,
    sfx: 0.9,
    ui: 0.7,
    rumble: 1,
    alwaysShowTags: false,
    catAfterWipes: 6,
    touchScheme: 'auto-grab',
    touchTilt: false,
    deadzone: 0.15,
    saturation: 1,
    padBrand: 'auto',
    ...overrides,
  };
}

function clear(
  overrides: Partial<LevelClear> & Pick<LevelClear, 'levelId' | 'playerCount'>,
): LevelClear {
  return { bestMs: 60_000, objectives: 0, assisted: false, clears: 1, ...overrides };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    cosmetics: { ...DEFAULT_COSMETICS },
    unlockedCosmetics: ['biro'],
    parcelsFound: [],
    posesFound: [],
    recipesMade: [],
    clears: {},
    levelsCleared: 0,
    deaths: 0,
    metresSwung: 0,
    showdownRating: 1000,
    showdownWins: 0,
    showdownLosses: 0,
    settings: settings(),
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("Bum's Rush save merge (§10.4)", () => {
  it('unions unlockedCosmetics, parcelsFound, posesFound and recipesMade', () => {
    const local = profile({
      unlockedCosmetics: ['biro', 'eraser'],
      parcelsFound: ['p1'],
      posesFound: ['pose-a'],
      recipesMade: [],
    });
    const remote = profile({
      unlockedCosmetics: ['biro', 'sharpener'],
      parcelsFound: ['p2'],
      posesFound: [],
      recipesMade: ['recipe-a'],
    });

    const { merged } = mergeProfiles(local, remote);
    expect(merged.unlockedCosmetics).toEqual(['biro', 'eraser', 'sharpener']);
    expect(merged.parcelsFound).toEqual(['p1', 'p2']);
    expect(merged.posesFound).toEqual(['pose-a']);
    expect(merged.recipesMade).toEqual(['recipe-a']);
  });

  it('per-level clear: best time wins, objectives union', () => {
    const key = clearKey('w1-01', 1);
    const local = profile({
      clears: {
        [key]: clear({ levelId: 'w1-01', playerCount: 1, bestMs: 42_000, objectives: 0b001 }),
      },
    });
    const remote = profile({
      clears: {
        [key]: clear({ levelId: 'w1-01', playerCount: 1, bestMs: 39_000, objectives: 0b010 }),
      },
    });

    const { merged } = mergeProfiles(local, remote);
    const result = merged.clears[key]!;
    expect(result.bestMs).toBe(39_000); // remote's faster time
    expect(result.objectives).toBe(0b011); // union of both objective sets
  });

  it("per-level clear: assisted is true only if BOTH sides were assisted (§10.4's literal AND)", () => {
    const key = clearKey('w1-01', 1);
    const bothAssisted = mergeProfiles(
      profile({ clears: { [key]: clear({ levelId: 'w1-01', playerCount: 1, assisted: true }) } }),
      profile({ clears: { [key]: clear({ levelId: 'w1-01', playerCount: 1, assisted: true }) } }),
    ).merged.clears[key]!.assisted;
    expect(bothAssisted).toBe(true);

    const oneAssisted = mergeProfiles(
      profile({ clears: { [key]: clear({ levelId: 'w1-01', playerCount: 1, assisted: true }) } }),
      profile({ clears: { [key]: clear({ levelId: 'w1-01', playerCount: 1, assisted: false }) } }),
    ).merged.clears[key]!.assisted;
    expect(oneAssisted).toBe(false);
  });

  it('a solo clear and a 4-player clear of the same level are separate records, not merged together', () => {
    const soloKey = clearKey('w1-01', 1);
    const coopKey = clearKey('w1-01', 4);
    const local = profile({
      clears: { [soloKey]: clear({ levelId: 'w1-01', playerCount: 1, bestMs: 40_000 }) },
    });
    const remote = profile({
      clears: { [coopKey]: clear({ levelId: 'w1-01', playerCount: 4, bestMs: 90_000 }) },
    });

    const { merged } = mergeProfiles(local, remote);
    expect(merged.clears[soloKey]!.bestMs).toBe(40_000);
    expect(merged.clears[coopKey]!.bestMs).toBe(90_000);
    // Both records exist for the same level id — a 4p clear must never grant the solo record.
    expect(Object.keys(merged.clears)).toHaveLength(2);
  });

  it('levelsCleared is recomputed from distinct levels in the merged clears, not summed', () => {
    // Local and remote agree on 9 of their cleared levels and diverge on one
    // each — a naive sum would report 20; the truth is 11 distinct levels.
    const shared = Array.from({ length: 9 }, (_, i) => `w1-0${i + 1}`);
    const localOnly = 'w2-01';
    const remoteOnly = 'w2-02';

    const toClears = (levelIds: string[]) =>
      Object.fromEntries(
        levelIds.map((levelId) => [clearKey(levelId, 1), clear({ levelId, playerCount: 1 })]),
      );

    const local = profile({ clears: toClears([...shared, localOnly]), levelsCleared: 10 });
    const remote = profile({ clears: toClears([...shared, remoteOnly]), levelsCleared: 10 });

    const { merged } = mergeProfiles(local, remote);
    expect(merged.levelsCleared).toBe(11);
  });

  it('settings (and equipped cosmetics) follow recency: the more-recently-modified profile wins, remote on a tie', () => {
    const localSettings = settings({ music: 0.1 });
    const remoteSettings = settings({ music: 0.9 });

    const localNewer = mergeProfiles(
      profile({ settings: localSettings, updatedAt: 200 }),
      profile({ settings: remoteSettings, updatedAt: 100 }),
    );
    expect(localNewer.merged.settings.music).toBe(0.1);
    expect(localNewer.report.settings.source).toBe('local');

    const remoteNewer = mergeProfiles(
      profile({ settings: localSettings, updatedAt: 100 }),
      profile({ settings: remoteSettings, updatedAt: 200 }),
    );
    expect(remoteNewer.merged.settings.music).toBe(0.9);
    expect(remoteNewer.report.settings.source).toBe('remote');

    const tie = mergeProfiles(
      profile({ settings: localSettings, updatedAt: 150 }),
      profile({ settings: remoteSettings, updatedAt: 150 }),
    );
    expect(tie.merged.settings.music).toBe(0.9); // a tie goes to remote, per §10.4's wording
    expect(tie.report.settings.source).toBe('remote');
  });

  it('showdownRating/Wins/Losses always come from remote — guests have no rating', () => {
    const guestLocal = profile({ showdownRating: 1000, showdownWins: 0, showdownLosses: 0 });
    const establishedRemote = profile({
      showdownRating: 1450,
      showdownWins: 30,
      showdownLosses: 12,
    });

    const { merged } = mergeProfiles(guestLocal, establishedRemote);
    expect(merged.showdownRating).toBe(1450);
    expect(merged.showdownWins).toBe(30);
    expect(merged.showdownLosses).toBe(12);
  });

  it('is idempotent: merging the result with one of the original inputs again changes nothing', () => {
    const key = clearKey('w1-01', 1);
    const local = profile({
      unlockedCosmetics: ['biro', 'eraser'],
      parcelsFound: ['p1'],
      deaths: 40,
      metresSwung: 12_000,
      clears: {
        [key]: clear({
          levelId: 'w1-01',
          playerCount: 1,
          bestMs: 50_000,
          objectives: 0b001,
          clears: 2,
        }),
      },
      updatedAt: 500,
    });
    const remote = profile({
      unlockedCosmetics: ['biro', 'sharpener'],
      parcelsFound: ['p2'],
      deaths: 75,
      metresSwung: 9_000,
      showdownRating: 1200,
      showdownWins: 5,
      showdownLosses: 3,
      clears: {
        [key]: clear({
          levelId: 'w1-01',
          playerCount: 1,
          bestMs: 45_000,
          objectives: 0b010,
          clears: 4,
        }),
      },
      updatedAt: 300,
    });

    const first = mergeProfiles(local, remote).merged;
    const mergedAgainstRemote = mergeProfiles(first, remote).merged;
    const mergedAgainstItself = mergeProfiles(first, first).merged;

    expect(mergedAgainstRemote).toEqual(first);
    expect(mergedAgainstItself).toEqual(first);
  });

  it('is idempotent across repeated full sign-in merges of the exact same pair', () => {
    const local = profile({ unlockedCosmetics: ['biro'], deaths: 3, updatedAt: 10 });
    const remote = profile({
      unlockedCosmetics: ['eraser'],
      deaths: 9,
      showdownWins: 2,
      updatedAt: 20,
    });

    const once = mergeProfiles(local, remote).merged;
    const twice = mergeProfiles(mergeProfiles(local, remote).merged, remote).merged;
    expect(twice).toEqual(once);
  });

  it('is commutative on every symmetric field (union/min/OR/max) — only settings/cosmetics read which side is "local"', () => {
    const key = clearKey('w1-01', 1);
    const a = profile({
      unlockedCosmetics: ['biro'],
      parcelsFound: ['p1'],
      deaths: 10,
      metresSwung: 500,
      clears: {
        [key]: clear({ levelId: 'w1-01', playerCount: 1, bestMs: 50_000, objectives: 0b001 }),
      },
    });
    const b = profile({
      unlockedCosmetics: ['eraser'],
      parcelsFound: ['p2'],
      deaths: 25,
      metresSwung: 300,
      clears: {
        [key]: clear({ levelId: 'w1-01', playerCount: 1, bestMs: 40_000, objectives: 0b010 }),
      },
    });

    const ab = mergeProfiles(a, b).merged;
    const ba = mergeProfiles(b, a).merged;

    expect(ab.unlockedCosmetics).toEqual(ba.unlockedCosmetics);
    expect(ab.parcelsFound).toEqual(ba.parcelsFound);
    expect(ab.deaths).toEqual(ba.deaths);
    expect(ab.metresSwung).toEqual(ba.metresSwung);
    expect(ab.clears[key]!.bestMs).toEqual(ba.clears[key]!.bestMs);
    expect(ab.clears[key]!.objectives).toEqual(ba.clears[key]!.objectives);
    expect(ab.levelsCleared).toEqual(ba.levelsCleared);
  });

  it('never loses a clear record either side already has, even when the other side has nothing for that level', () => {
    const onlyLocalKey = clearKey('w5-03', 2);
    const local = profile({
      clears: { [onlyLocalKey]: clear({ levelId: 'w5-03', playerCount: 2, bestMs: 77_000 }) },
    });
    const remote = profile({ clears: {} });

    const { merged } = mergeProfiles(local, remote);
    expect(merged.clears[onlyLocalKey]).toEqual(local.clears[onlyLocalKey]);
  });

  it('counters use max, not sum — summing would double on the very re-merge idempotency requires', () => {
    const local = profile({ deaths: 100, metresSwung: 4_000 });
    const remote = profile({ deaths: 30, metresSwung: 9_000 });

    const { merged } = mergeProfiles(local, remote);
    expect(merged.deaths).toBe(100);
    expect(merged.metresSwung).toBe(9_000);

    // The failure mode a naive sum has and this module must not: merging an
    // already-merged profile with itself must not inflate its own counters.
    const selfMerged = mergeProfiles(merged, merged).merged;
    expect(selfMerged.deaths).toBe(merged.deaths);
    expect(selfMerged.metresSwung).toBe(merged.metresSwung);
  });

  it('reports which source won for settings, and how much the merge gained', () => {
    const local = profile({ unlockedCosmetics: ['biro'], updatedAt: 100 });
    const remote = profile({ unlockedCosmetics: ['biro', 'eraser', 'sharpener'], updatedAt: 50 });

    const { report } = mergeProfiles(local, remote);
    expect(report.settings.source).toBe('local'); // local is newer here
    expect(report.gained.unlockedCosmetics).toBe(2); // eraser + sharpener, beyond what local already had
    expect(report.showdownRatingSource).toBe('remote');
  });
});

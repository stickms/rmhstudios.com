import { describe, it, expect, vi } from 'vitest';

// The adapters module builds a Prisma client at import time. These tests only
// read its id list, so stub the client rather than requiring a live DATABASE_URL.
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import { games } from '@/lib/games';
import {
  GAME_SCORE_RULES,
  getGameScoreRules,
  scoredGameIds,
  validateScore,
} from '@/lib/game/registry';
import { submittableGameIds } from '@/lib/game/adapters.server';

/**
 * The game layer as an EXECUTABLE gate.
 *
 * Unifying scoring created three lists that describe the same games from
 * different angles — the catalog (`lib/games.ts`), the scoring rules
 * (`lib/game/registry.ts`) and the storage adapters
 * (`lib/game/adapters.server.ts`). Three lists drift. When they do, the failure
 * is quiet and bad: a game with rules but no adapter 404s on submit, a game
 * with an adapter but no rules bypasses validation entirely, and a registry id
 * that doesn't match the catalog breaks the arcade challenge lookup that keys
 * on it.
 *
 * These tests make drift a build failure instead of a bug report.
 */

describe('game registry consistency', () => {
  it('every listed scored game exists in the site catalog', () => {
    const catalogIds = new Set(games.map((g) => g.id));
    const orphans = GAME_SCORE_RULES.filter(
      // Unlisted games (e.g. the /secret/ ones) are deliberately absent from
      // the public catalog, so only listed games must appear there.
      (r) => !r.unlisted && !catalogIds.has(r.id),
    ).map((r) => r.id);

    expect(
      orphans,
      'Scoring rules reference game ids that are not in lib/games.ts. The id is the join key ' +
        'for arcade challenges and leaderboards, so a mismatch silently disables both.',
    ).toEqual([]);
  });

  it('scoring rules and submit-capable adapters cover exactly the same games', () => {
    const rules = [...scoredGameIds()].sort();
    const adapters = [...submittableGameIds()].sort();

    expect(
      adapters.filter((id) => !rules.includes(id)),
      'These games have a storage adapter but no scoring rules, so submissions would skip ' +
        'validation entirely. Add them to GAME_SCORE_RULES.',
    ).toEqual([]);

    expect(
      rules.filter((id) => !adapters.includes(id)),
      'These games have scoring rules but no storage adapter, so every submission 404s. ' +
        'Add them to lib/game/adapters.server.ts.',
    ).toEqual([]);
  });

  it('every rule set is internally coherent', () => {
    for (const rules of GAME_SCORE_RULES) {
      expect(rules.maxScore, `${rules.id}: maxScore must be positive`).toBeGreaterThan(0);
      expect(rules.label.length, `${rules.id}: needs a label`).toBeGreaterThan(0);
      if (rules.maxScorePerSecond !== undefined) {
        expect(
          rules.maxScorePerSecond,
          `${rules.id}: maxScorePerSecond must be positive`,
        ).toBeGreaterThan(0);
      }
      if (rules.progressLabel !== undefined) {
        expect(
          rules.maxProgress,
          `${rules.id}: declares a progress metric, so it needs a maxProgress ceiling`,
        ).toBeDefined();
      }
    }
  });
});

describe('score validation', () => {
  const GAME = 'void-breaker';

  it('accepts an ordinary run', () => {
    const result = validateScore(GAME, { score: 5_000, durationMs: 120_000, progress: 12 });
    expect(result.ok).toBe(true);
  });

  it('rejects an unknown game rather than defaulting to permissive', () => {
    expect(validateScore('not-a-game', { score: 1 })).toEqual({
      ok: false,
      reason: 'UNKNOWN_GAME',
    });
  });

  it.each([
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects a %s score', (_label, score) => {
    const result = validateScore(GAME, { score });
    expect(result.ok).toBe(false);
  });

  it('rejects a score above the game ceiling', () => {
    const rules = getGameScoreRules(GAME)!;
    expect(validateScore(GAME, { score: rules.maxScore + 1 })).toEqual({
      ok: false,
      reason: 'SCORE_TOO_HIGH',
    });
  });

  it('rejects a run too short to have produced a score', () => {
    expect(validateScore(GAME, { score: 100, durationMs: 10 })).toEqual({
      ok: false,
      reason: 'RUN_TOO_SHORT',
    });
  });

  // The forgery this exists to catch: a plausible-looking total that no player
  // could reach at that rate. Ten seconds of play cannot yield a million points.
  it('rejects an implausible score rate', () => {
    expect(validateScore(GAME, { score: 1_000_000, durationMs: 10_000 })).toEqual({
      ok: false,
      reason: 'SCORE_RATE_IMPLAUSIBLE',
    });
  });

  it('skips rate checks when no duration is reported', () => {
    // Games that don't time their runs must still be able to submit; the
    // ceiling is the only bound that applies.
    expect(validateScore(GAME, { score: 1_000_000 }).ok).toBe(true);
  });

  it('rejects a progress value above its ceiling', () => {
    const rules = getGameScoreRules(GAME)!;
    expect(validateScore(GAME, { score: 10, progress: (rules.maxProgress ?? 0) + 1 })).toEqual({
      ok: false,
      reason: 'PROGRESS_TOO_HIGH',
    });
  });
});

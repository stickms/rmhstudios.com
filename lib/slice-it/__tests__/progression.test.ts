/**
 * Slice It! progression (X1/X3/X14).
 *
 * Two things this file exists to pin:
 *
 *  1. **Achievement unlock conditions** (`lib/achievements/slice-it.ts`) — pure,
 *     no database, so every grade/modifier/difficulty boundary is checked
 *     directly against the function that decides it.
 *  2. **The daily coin cap** (`lib/slice-it/progression.server.ts`) — scaled by
 *     difficulty, capped at `COIN_DAILY_CAP`, and idempotent per
 *     (user, song, difficulty, modPool, score) so a retried submission cannot
 *     double-pay. Prisma and `awardCoins` are mocked; the assertions are on
 *     what `awardCoins` was called with, not on any real ledger.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countActiveModifiers,
  sliceItAchievementsForRun,
  STACKED_MODIFIER_THRESHOLD,
  type SliceItRunFacts,
} from '../../achievements/slice-it';
import { DEFAULT_MODIFIERS } from '../modifiers';
import type { Modifiers } from '../types';

/* ─── Achievement unlock conditions ──────────────────────────────────────── */

const baseFacts: SliceItRunFacts = {
  difficulty: 'normal',
  accuracy: 0.8,
  cleared: true,
  isFullCombo: false,
  modifiers: DEFAULT_MODIFIERS,
};

describe('sliceItAchievementsForRun', () => {
  it('always credits first_play, even on a failed run', () => {
    const ids = sliceItAchievementsForRun({ ...baseFacts, cleared: false, accuracy: 0 });
    expect(ids).toEqual(['game.slice_it.first_play']);
  });

  it('does not grade, full-combo or modifier-count a run that did not clear', () => {
    const ids = sliceItAchievementsForRun({
      ...baseFacts,
      cleared: false,
      accuracy: 1,
      isFullCombo: true,
      modifiers: {
        ...DEFAULT_MODIFIERS,
        invisible: true,
        bombs: true,
        spin: true,
        switching: true,
      },
    });
    expect(ids).toEqual(['game.slice_it.first_play']);
  });

  it('grants s_rank at the S boundary (95%) but not just under it', () => {
    expect(sliceItAchievementsForRun({ ...baseFacts, accuracy: 0.95 })).toContain(
      'game.slice_it.s_rank',
    );
    expect(sliceItAchievementsForRun({ ...baseFacts, accuracy: 0.9499 })).not.toContain(
      'game.slice_it.s_rank',
    );
  });

  it('grants ss_rank only at exactly 100% accuracy, and s_rank alongside it', () => {
    const ids = sliceItAchievementsForRun({ ...baseFacts, accuracy: 1 });
    expect(ids).toContain('game.slice_it.ss_rank');
    expect(ids).toContain('game.slice_it.s_rank');

    // 99.99% is S, not SS — SS is reserved for a flawless run.
    const almost = sliceItAchievementsForRun({ ...baseFacts, accuracy: 0.9999 });
    expect(almost).not.toContain('game.slice_it.ss_rank');
    expect(almost).toContain('game.slice_it.s_rank');
  });

  it('grants full_combo on any difficulty but expert_fc only on Expert', () => {
    const normalFc = sliceItAchievementsForRun({
      ...baseFacts,
      isFullCombo: true,
      difficulty: 'normal',
    });
    expect(normalFc).toContain('game.slice_it.full_combo');
    expect(normalFc).not.toContain('game.slice_it.expert_fc');

    const expertFc = sliceItAchievementsForRun({
      ...baseFacts,
      isFullCombo: true,
      difficulty: 'expert',
    });
    expect(expertFc).toContain('game.slice_it.full_combo');
    expect(expertFc).toContain('game.slice_it.expert_fc');
  });

  it('does not grant expert_fc for an Expert run that was not a full combo', () => {
    const ids = sliceItAchievementsForRun({
      ...baseFacts,
      difficulty: 'expert',
      isFullCombo: false,
    });
    expect(ids).not.toContain('game.slice_it.expert_fc');
  });

  it('grants stacked at exactly the modifier threshold, not one below it', () => {
    const four: Modifiers = {
      ...DEFAULT_MODIFIERS,
      invisible: true,
      bombs: true,
      spin: true,
      switching: true,
    };
    expect(countActiveModifiers(four)).toBe(STACKED_MODIFIER_THRESHOLD);
    expect(sliceItAchievementsForRun({ ...baseFacts, modifiers: four })).toContain(
      'game.slice_it.stacked',
    );

    const three: Modifiers = { ...DEFAULT_MODIFIERS, invisible: true, bombs: true, spin: true };
    expect(sliceItAchievementsForRun({ ...baseFacts, modifiers: three })).not.toContain(
      'game.slice_it.stacked',
    );
  });

  it('does not count speed or difficulty as modifiers', () => {
    const fast: Modifiers = { ...DEFAULT_MODIFIERS, speed: 2.0, difficulty: 'expert' };
    expect(countActiveModifiers(fast)).toBe(0);
  });
});

/* ─── Coins: the daily cap ────────────────────────────────────────────────── */

const { awardCoinsCalls, prismaMock } = vi.hoisted(() => {
  const awardCoinsCalls: { userId: string; amount: number; opts: Record<string, unknown> }[] = [];
  const prismaMock = {
    coinTransaction: { aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
    sliceRun: { count: vi.fn(async () => 2), findMany: vi.fn(async () => []) },
    songLeaderboard: { findMany: vi.fn(async () => []) },
  };
  return { awardCoinsCalls, prismaMock };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/coins.server', () => ({
  awardCoins: vi.fn(async (userId: string, amount: number, opts: Record<string, unknown>) => {
    awardCoinsCalls.push({ userId, amount, opts });
    return true;
  }),
}));
vi.mock('@/lib/achievements/engine.server', () => ({
  grantAchievement: vi.fn(async () => true),
  progressAchievement: vi.fn(async () => false),
}));

const { reportSliceItRun, COIN_DAILY_CAP } = await import('../progression.server');

const baseRun = {
  userId: 'user-1',
  songId: 'song-1',
  modPool: 'none',
  difficulty: 'normal' as const,
  score: 10_000,
  accuracy: 0.9,
  cleared: true,
  isFullCombo: false,
  modifiers: DEFAULT_MODIFIERS,
  isFirstClear: false,
  isNewBest: false,
};

/** Only the run-clear/new-best coin call — excludes the streak bonus. */
const runCoinCalls = () => awardCoinsCalls.filter((c) => c.opts.entityId === baseRun.songId);

beforeEach(() => {
  awardCoinsCalls.length = 0;
  prismaMock.coinTransaction.aggregate.mockReset().mockResolvedValue({ _sum: { amount: 0 } });
  // 2 = "not the first run of the day", so the practice-streak bonus stays out
  // of the way of tests that are only about the run-clear/new-best coins.
  prismaMock.sliceRun.count.mockReset().mockResolvedValue(2);
  prismaMock.sliceRun.findMany.mockReset().mockResolvedValue([]);
  prismaMock.songLeaderboard.findMany.mockReset().mockResolvedValue([]);
});

describe('awardRunCoins (via reportSliceItRun)', () => {
  it('pays nothing for a run that is neither a first clear nor a new best', async () => {
    await reportSliceItRun(baseRun);
    expect(runCoinCalls()).toHaveLength(0);
  });

  it('pays first-clear + new-best, scaled by the normal-difficulty multiplier (1.0)', async () => {
    await reportSliceItRun({ ...baseRun, isFirstClear: true, isNewBest: true });
    expect(runCoinCalls()).toHaveLength(1);
    expect(runCoinCalls()[0].amount).toBe(15); // (10 + 5) * 1.0
  });

  it('pays only the new-best amount on a later improvement', async () => {
    await reportSliceItRun({ ...baseRun, isFirstClear: false, isNewBest: true });
    expect(runCoinCalls()[0].amount).toBe(5);
  });

  it('scales the award up on a harder difficulty', async () => {
    await reportSliceItRun({
      ...baseRun,
      difficulty: 'expert',
      isFirstClear: true,
      isNewBest: true,
    });
    expect(runCoinCalls()[0].amount).toBe(Math.round(15 * 1.5)); // expert multiplier
  });

  it('scales the award down on an easier difficulty — the anti-grind property', async () => {
    await reportSliceItRun({ ...baseRun, difficulty: 'easy', isFirstClear: true, isNewBest: true });
    expect(runCoinCalls()[0].amount).toBe(Math.round(15 * 0.7)); // easy multiplier
  });

  it('caps the award at whatever is left of the daily budget', async () => {
    prismaMock.coinTransaction.aggregate.mockResolvedValue({
      _sum: { amount: COIN_DAILY_CAP - 3 },
    });
    await reportSliceItRun({ ...baseRun, isFirstClear: true, isNewBest: true });
    expect(runCoinCalls()[0].amount).toBe(3);
  });

  it('pays nothing once the daily cap is already reached', async () => {
    prismaMock.coinTransaction.aggregate.mockResolvedValue({ _sum: { amount: COIN_DAILY_CAP } });
    await reportSliceItRun({ ...baseRun, isFirstClear: true, isNewBest: true });
    expect(runCoinCalls()).toHaveLength(0);
  });

  it('gives a retry of the same event the same idempotency key', async () => {
    await reportSliceItRun({ ...baseRun, isFirstClear: true, isNewBest: true });
    await reportSliceItRun({ ...baseRun, isFirstClear: true, isNewBest: true });
    const keys = runCoinCalls().map((c) => c.opts.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it('gives a genuine improvement (a higher score) a fresh idempotency key', async () => {
    await reportSliceItRun({ ...baseRun, isNewBest: true, score: 10_000 });
    await reportSliceItRun({ ...baseRun, isNewBest: true, score: 20_000 });
    const keys = runCoinCalls().map((c) => c.opts.idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe('the practice-streak coin bonus', () => {
  it('pays once, on the first ranked run of the UTC day', async () => {
    prismaMock.sliceRun.count.mockResolvedValue(1);
    await reportSliceItRun(baseRun);
    expect(awardCoinsCalls.some((c) => c.opts.entityId === 'streak')).toBe(true);
  });

  it('does not pay again on a second run the same day', async () => {
    prismaMock.sliceRun.count.mockResolvedValue(2);
    await reportSliceItRun(baseRun);
    expect(awardCoinsCalls.some((c) => c.opts.entityId === 'streak')).toBe(false);
  });
});

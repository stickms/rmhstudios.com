/**
 * Assisted runs (sprint 07 02), the mission-critical half: the server decides which runs are assisted
 * at run start and records a claim; submitGameScore skips the board write for an assisted run (claim, or
 * assisted settings right now), still records play and progression, and never lets the client say
 * ranked. A game outside ASSIST_CAPABLE always writes, and Redis trouble falls back to the settings check.
 * In-memory stand-ins; no database, no Redis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  redis: new Map<string, unknown>(),
  redisDown: false,
  settings: null as
    | null
    | 'throw'
    | {
        holdToPress: boolean;
        speedFloorPerMille: number;
        calmVisuals: boolean;
        colorSafe: boolean;
        noTimedInput: boolean;
      },
  submitted: 0,
  recordGamePlay: vi.fn(async () => {}),
  reportGameResult: vi.fn(async () => {}),
  recordPersonalBest: vi.fn(async () => true),
  rankOf: vi.fn(async () => 3),
  emitPersonalBest: vi.fn(async () => {}),
  emitPersonalBestCreated: vi.fn(async () => {}),
  stored: null as number | null,
}));

vi.mock('@/lib/redis.server', () => ({
  redisSetJSON: vi.fn(async (key: string, value: unknown) => {
    if (h.redisDown) throw new Error('down');
    h.redis.set(key, value);
  }),
  redisGetJSON: vi.fn(async (key: string) => {
    if (h.redisDown) throw new Error('down');
    return h.redis.get(key) ?? null;
  }),
  redisDel: vi.fn(async (...keys: string[]) => {
    if (h.redisDown) throw new Error('down');
    for (const k of keys) h.redis.delete(k);
  }),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    gameAssistPreference: {
      findUnique: vi.fn(async () => {
        if (h.settings === 'throw') throw new Error('db down');
        return h.settings;
      }),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({
    allowed: true,
    retryAfter: 0,
  }),
}));
vi.mock('@/lib/quests/engine.server', () => ({
  recordGamePlay: h.recordGamePlay,
}));
vi.mock('@/lib/game/results.server', () => ({
  reportGameResult: h.reportGameResult,
}));
vi.mock('@/lib/game/personal-bests.server', () => ({
  recordPersonalBest: h.recordPersonalBest,
}));
vi.mock('@/lib/developer/recipes.server', () => ({
  emitPersonalBest: h.emitPersonalBest,
}));
vi.mock('@/lib/webhooks/game-emit.server', () => ({
  emitPersonalBestCreated: h.emitPersonalBestCreated,
}));
vi.mock('@/lib/game/adapters.server', () => ({
  getGameAdapter: () => ({
    submit: vi.fn(async () => {
      h.submitted++;
    }),
    personalBest: async () => h.stored,
    rankOf: h.rankOf,
    lowerIsBetter: false,
  }),
}));

import { startAssistRun, consumeAssistRun, assistRunKey, assistGameFor } from '@/lib/game/assist-run.server';
import { submitGameScore } from '@/lib/game/submit.server';

const calm = {
  holdToPress: false,
  speedFloorPerMille: 1000,
  calmVisuals: true,
  colorSafe: false,
  noTimedInput: false,
};
const plain = {
  ...calm,
  calmVisuals: false,
};
const run = (gameId: string) => ({
  gameId,
  userId: 'u1',
  score: 500,
  progress: 3,
  durationMs: 60_000,
});

beforeEach(() => {
  h.redis.clear();
  h.redisDown = false;
  h.settings = null;
  h.submitted = 0;
  h.stored = 100;
  vi.clearAllMocks();
});

describe('startAssistRun', () => {
  it('writes a claim for an assisted run of an adopting game', async () => {
    h.settings = calm;
    const profile = await startAssistRun('u1', 'void-breaker');
    expect(profile.ranked).toBe(false);
    expect(h.redis.has(assistRunKey('void-breaker', 'u1'))).toBe(true);
    expect(assistRunKey('void-breaker', 'u1')).toBe('assist-run:void-breaker:u1');
  });

  it('writes nothing and stays ranked with no assists', async () => {
    h.settings = plain;
    expect((await startAssistRun('u1', 'synapse-storm')).ranked).toBe(true);
    expect(h.redis.size).toBe(0);
  });

  it('stays ranked, and writes nothing, in a game that has not adopted the layer', async () => {
    h.settings = calm;
    expect((await startAssistRun('u1', 'neon-driftway')).ranked).toBe(true);
    expect(h.redis.size).toBe(0);
  });

  it('clears a stale claim when a new run starts unassisted', async () => {
    h.settings = calm;
    await startAssistRun('u1', 'void-breaker');
    h.settings = plain;
    await startAssistRun('u1', 'void-breaker');
    expect(h.redis.size).toBe(0);
  });

  it('does not fail the start when Redis is down', async () => {
    h.settings = calm;
    h.redisDown = true;
    expect((await startAssistRun('u1', 'void-breaker')).ranked).toBe(false);
  });

  it('shares Void Breaker’s profile with its Boss Rush board', async () => {
    h.settings = calm;
    expect(assistGameFor('void-breaker-boss-rush')).toBe('void-breaker');
    const profile = await startAssistRun('u1', 'void-breaker-boss-rush');
    expect(profile.ranked).toBe(false);
    expect(h.redis.has(assistRunKey('void-breaker', 'u1'))).toBe(true);
  });
});

describe('submitGameScore and assisted runs', () => {
  it('skips the board write when a claim exists, even after the settings were switched off', async () => {
    h.settings = calm;
    await startAssistRun('u1', 'void-breaker');
    h.settings = plain; // assists turned off mid-run
    const res = await submitGameScore(run('void-breaker'));
    expect(res).toMatchObject({
      ok: true,
      ranked: false,
    });
    expect(h.submitted).toBe(0);
  });

  it('consumes the claim, so the next run is ranked', async () => {
    h.settings = calm;
    await startAssistRun('u1', 'void-breaker');
    h.settings = plain;
    await submitGameScore(run('void-breaker'));
    const next = await submitGameScore(run('void-breaker'));
    expect(next).toMatchObject({
      ok: true,
      ranked: true,
    });
    expect(h.submitted).toBe(1);
  });

  it('still records play, progression and the personal best for an assisted run', async () => {
    h.settings = calm;
    await startAssistRun('u1', 'void-breaker');
    const res = await submitGameScore(run('void-breaker'));
    expect(res.ok && res.ranked).toBe(false);
    expect(h.recordGamePlay).toHaveBeenCalledWith('u1');
    expect(h.reportGameResult).toHaveBeenCalled();
    expect(h.recordPersonalBest).toHaveBeenCalledTimes(1);
    // No board write, so no board rank and no outward events.
    expect(h.rankOf).not.toHaveBeenCalled();
    expect(h.emitPersonalBest).not.toHaveBeenCalled();
    expect(h.emitPersonalBestCreated).not.toHaveBeenCalled();
    if (res.ok)
      expect(res.moment).toMatchObject({
        kind: 'pb',
        rank: null,
      });
  });

  it('skips the board write with no claim but assisted settings right now', async () => {
    h.settings = calm;
    const res = await submitGameScore(run('synapse-storm'));
    expect(res).toMatchObject({
      ok: true,
      ranked: false,
    });
    expect(h.submitted).toBe(0);
  });

  it('writes an unassisted run and reports it ranked', async () => {
    h.settings = plain;
    const res = await submitGameScore(run('void-breaker'));
    expect(res).toMatchObject({
      ok: true,
      ranked: true,
    });
    expect(h.submitted).toBe(1);
    expect(h.emitPersonalBest).toHaveBeenCalled();
  });

  it('always writes in a game outside ASSIST_CAPABLE, whatever the settings', async () => {
    h.settings = calm;
    h.redis.set(assistRunKey('neon-driftway', 'u1'), {
      at: 1,
    });
    const res = await submitGameScore(run('neon-driftway'));
    expect(res).toMatchObject({
      ok: true,
      ranked: true,
    });
    expect(h.submitted).toBe(1);
  });

  it('falls back to the settings check when Redis fails', async () => {
    h.settings = calm;
    h.redisDown = true;
    expect(await consumeAssistRun('u1', 'void-breaker')).toBe(true);
    h.settings = plain;
    expect(await consumeAssistRun('u1', 'void-breaker')).toBe(false);
  });

  it('keepClaim reads the claim twice; the first clear happens only without it', async () => {
    h.settings = plain;
    h.redis.set('assist-run:dream-rift:u1', { at: 1 });
    expect(await consumeAssistRun('u1', 'dream-rift', { keepClaim: true, settleClaim: true })).toBe(true);
    expect(await consumeAssistRun('u1', 'dream-rift', { keepClaim: true })).toBe(true);
    expect(h.redis.has('assist-run:dream-rift:u1')).toBe(true);
    expect(await consumeAssistRun('u1', 'dream-rift')).toBe(true);
    expect(h.redis.has('assist-run:dream-rift:u1')).toBe(false);
    expect(await consumeAssistRun('u1', 'dream-rift', { keepClaim: true })).toBe(false);
  });

  it('treats a run as unranked when the stored settings cannot be read', async () => {
    h.settings = 'throw';
    expect(await consumeAssistRun('u1', 'void-breaker')).toBe(true);
  });

  it('never reads the client for ranked: the input has no such field', async () => {
    h.settings = calm;
    const res = await submitGameScore({
      ...run('void-breaker'),
      ranked: true,
    } as never);
    expect(res).toMatchObject({
      ok: true,
      ranked: false,
    });
  });
});

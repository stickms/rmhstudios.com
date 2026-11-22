/**
 * Assisted runs and the Neon Driftway and Laundry Sort boards (sprint 09 17), the mission-critical
 * half: the server decides at run start that a run is assisted, an assisted result never reaches a
 * ranked board (the leaderboard table, the basket), and a game only gets the assists it honours.
 * In-memory stand-ins; no database, no Redis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  redis: new Map<string, unknown>(),
  settings: null as null | {
    holdToPress: boolean;
    speedFloorPerMille: number;
    calmVisuals: boolean;
    colorSafe: boolean;
    noTimedInput: boolean;
  },
  boardWrites: 0,
  recordGamePlay: vi.fn(async () => {}),
  reportGameResult: vi.fn(async () => {}),
  recordPersonalBest: vi.fn(async () => true),
  basketUpdates: [] as Array<{ data: { score: number | null; detail: Record<string, unknown> } }>,
}));

vi.mock('@/lib/redis.server', () => ({
  redisSetJSON: vi.fn(async (key: string, value: unknown) => {
    h.redis.set(key, value);
  }),
  redisGetJSON: vi.fn(async (key: string) => h.redis.get(key) ?? null),
  redisDel: vi.fn(async (...keys: string[]) => {
    for (const k of keys) h.redis.delete(k);
  }),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    gameAssistPreference: { findUnique: vi.fn(async () => h.settings), upsert: vi.fn(), deleteMany: vi.fn() },
    arcadeSeedRun: {
      findUnique: vi.fn(async () => ({
        score: null,
        detail: null,
        startedAt: new Date(Date.now() - 60_000),
        finishedAt: null,
      })),
      updateMany: vi.fn(async (args: { data: { score: number | null; detail: Record<string, unknown> } }) => {
        h.basketUpdates.push(args);
        return { count: 1 };
      }),
    },
  },
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true, retryAfter: 0 }) }));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: h.recordGamePlay }));
vi.mock('@/lib/game/results.server', () => ({ reportGameResult: h.reportGameResult }));
vi.mock('@/lib/game/personal-bests.server', () => ({ recordPersonalBest: h.recordPersonalBest }));
vi.mock('@/lib/developer/recipes.server', () => ({ emitPersonalBest: vi.fn(async () => {}) }));
vi.mock('@/lib/webhooks/game-emit.server', () => ({ emitPersonalBestCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/game/adapters.server', () => ({
  getGameAdapter: () => ({
    submit: vi.fn(async () => {
      h.boardWrites++;
    }),
    personalBest: async () => null,
    rankOf: async () => 1,
    lowerIsBetter: false,
  }),
}));

import { startAssistRun, assistRunKey } from '@/lib/game/assist-run.server';
import { submitGameScore } from '@/lib/game/submit.server';
import { finishBasket } from '@/lib/arcade/basket.server';
import { HONOURED_SETTINGS, honouredSettings, profileFor, ASSIST_DEFAULTS } from '@/lib/game/assist';

const none = {
  holdToPress: false,
  speedFloorPerMille: 1000,
  calmVisuals: false,
  colorSafe: false,
  noTimedInput: false,
};

const drive = (gameId: string) => ({ gameId, userId: 'u1', score: 1200, progress: 800, durationMs: 90_000 });

beforeEach(() => {
  h.redis.clear();
  h.settings = none;
  h.boardWrites = 0;
  h.basketUpdates.length = 0;
  vi.clearAllMocks();
});

describe('an assisted Neon Driftway result', () => {
  it('is refused on the board when calm visuals were on at run start, even if switched off since', async () => {
    h.settings = { ...none, calmVisuals: true };
    const profile = await startAssistRun('u1', 'neon-driftway');
    expect(profile.ranked).toBe(false);
    h.settings = none;
    const res = await submitGameScore(drive('neon-driftway'));
    expect(res).toMatchObject({ ok: true, ranked: false });
    expect(h.boardWrites).toBe(0);
    // The play still counts; only the board is skipped.
    expect(h.recordGamePlay).toHaveBeenCalledWith('u1');
  });

  it('is refused for a speed floor alone', async () => {
    h.settings = { ...none, speedFloorPerMille: 700 };
    const res = await submitGameScore(drive('neon-driftway'));
    expect(res).toMatchObject({ ok: true, ranked: false });
    expect(h.boardWrites).toBe(0);
  });

  it('an unassisted run is written and ranked', async () => {
    const res = await submitGameScore(drive('neon-driftway'));
    expect(res).toMatchObject({ ok: true, ranked: true });
    expect(h.boardWrites).toBe(1);
  });

  it('holds hold-to-press and no-timed-input to no effect: Neon Driftway has neither, so the run stays ranked', async () => {
    h.settings = { ...none, holdToPress: true, noTimedInput: true };
    const profile = await startAssistRun('u1', 'neon-driftway');
    expect(profile.ranked).toBe(true);
    expect(h.redis.has(assistRunKey('neon-driftway', 'u1'))).toBe(false);
    const res = await submitGameScore(drive('neon-driftway'));
    expect(res).toMatchObject({ ok: true, ranked: true });
  });
});

describe('an assisted Laundry Sort run', () => {
  it('starts a claim for colour-safe, and for no timed input', async () => {
    h.settings = { ...none, colorSafe: true };
    expect((await startAssistRun('u1', 'laundry-sort')).ranked).toBe(false);
    expect(h.redis.has(assistRunKey('laundry-sort', 'u1'))).toBe(true);
    h.redis.clear();
    h.settings = { ...none, noTimedInput: true };
    const profile = await startAssistRun('u1', 'laundry-sort');
    expect(profile).toMatchObject({ ranked: false, noTimedInput: true });
  });

  it('stays ranked for settings it does not honour (calm visuals, hold to press, speed floor)', async () => {
    h.settings = { ...none, calmVisuals: true, holdToPress: true, speedFloorPerMille: 600 };
    const profile = await startAssistRun('u1', 'laundry-sort');
    expect(profile.ranked).toBe(true);
  });

  it('keeps an assisted basket attempt off the board: no score, the real one in detail', async () => {
    h.settings = { ...none, noTimedInput: true };
    await startAssistRun('u1', 'laundry-sort');
    const detail = { sorted: 20, wrong: 1, missed: 2, bestCombo: 9 };
    const r = await finishBasket('u1', 1500, detail);
    expect(r).toEqual({ ok: true, counted: false });
    expect(h.basketUpdates).toHaveLength(1);
    expect(h.basketUpdates[0].data.score).toBeNull();
    expect(h.basketUpdates[0].data.detail).toMatchObject({ assisted: true, assistedScore: 1500 });
  });

  it('files an unassisted basket attempt with its score', async () => {
    const detail = { sorted: 20, wrong: 1, missed: 2, bestCombo: 9 };
    const r = await finishBasket('u1', 1500, detail);
    expect(r).toEqual({ ok: true, counted: true });
    expect(h.basketUpdates[0].data.score).toBe(1500);
  });
});

describe('what each game honours', () => {
  const all = {
    ...ASSIST_DEFAULTS,
    holdToPress: true,
    speedFloor: 0.5,
    calmVisuals: true,
    colorSafe: true,
    noTimedInput: true,
  };

  it('drops the settings a game cannot honour and keeps the rest', () => {
    expect(honouredSettings('neon-driftway', all)).toEqual({
      ...ASSIST_DEFAULTS,
      speedFloor: 0.5,
      calmVisuals: true,
      colorSafe: true,
    });
    expect(honouredSettings('laundry-sort', all)).toEqual({ ...ASSIST_DEFAULTS, colorSafe: true, noTimedInput: true });
  });

  it('leaves a game that honours everything untouched', () => {
    expect(honouredSettings('void-breaker', all)).toBe(all);
  });

  it('only lists games that are assist capable', () => {
    for (const game of Object.keys(HONOURED_SETTINGS)) {
      expect(profileFor(game, all).ranked).toBe(false);
    }
  });
});

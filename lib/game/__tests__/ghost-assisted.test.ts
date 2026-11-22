/**
 * s10-18: an assisted Neon Driftway run sets no race ghost. The server decides "assisted" from the run-start claim
 * (the way the score path does), never from the client; the claim survives the score submit long enough for the
 * ghost save that follows it. In-memory stand-ins; no database, no Redis.
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
  saveGhost: vi.fn(async (_input: unknown) => ({ id: 'ghost-1' })),
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
  },
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true, retryAfter: 0 }) }));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: vi.fn(async () => {}) }));
vi.mock('@/lib/game/results.server', () => ({ reportGameResult: vi.fn(async () => {}) }));
vi.mock('@/lib/game/personal-bests.server', () => ({ recordPersonalBest: vi.fn(async () => true) }));
vi.mock('@/lib/developer/recipes.server', () => ({ emitPersonalBest: vi.fn(async () => {}) }));
vi.mock('@/lib/webhooks/game-emit.server', () => ({ emitPersonalBestCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/game/adapters.server', () => ({
  getGameAdapter: () => ({
    submit: vi.fn(async () => {}),
    personalBest: async () => null,
    rankOf: async () => 1,
    lowerIsBetter: false,
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => ({ user: { id: 'u1' } })) } } }));
vi.mock('@/lib/rate-limit.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit.server')>()),
  withRateLimitAsync: vi.fn(async () => null),
}));
vi.mock('@/lib/replays.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/replays.server')>()),
  saveGhost: h.saveGhost,
  getGhost: vi.fn(async () => null),
}));

import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { startAssistRun } from '@/lib/game/assist-run.server';
import { submitGameScore } from '@/lib/game/submit.server';
import { Route } from '@/app/routes/api/replays/ghost';

const assisted = {
  holdToPress: false,
  speedFloorPerMille: 800,
  calmVisuals: false,
  colorSafe: false,
  noTimedInput: false,
};

let n = 0;
async function postGhost() {
  n += 1;
  const request = new Request('http://localhost/api/replays/ghost', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'better-auth.session_token=test-1',
      'x-forwarded-for': `10.1.0.${n}`,
    },
    body: JSON.stringify({
      game: 'neon-driftway',
      level: 1,
      data: { level: 1, frames: [] },
      score: 1200,
      durationMs: 45_000,
    }),
  });
  const res = await handlersOf(Route).POST!({ request, params: {} });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const run = { gameId: 'neon-driftway', userId: 'u1', score: 1200, progress: 10, durationMs: 45_000 };

beforeEach(() => {
  h.redis.clear();
  h.settings = null;
  h.saveGhost.mockClear();
});

describe('POST /api/replays/ghost and assisted runs', () => {
  it('stores the ghost of an unassisted run', async () => {
    const { status, json } = await postGhost();
    expect(status).toBe(201);
    expect(json.id).toBe('ghost-1');
    expect(h.saveGhost).toHaveBeenCalledTimes(1);
  });

  it('stores no ghost for a run that started assisted, even after the assists were switched off mid-run', async () => {
    h.settings = assisted;
    await startAssistRun('u1', 'neon-driftway');
    h.settings = null; // switched off in another tab
    const { status, json } = await postGhost();
    expect(status).toBe(200);
    expect(json).toEqual({ saved: false, reason: 'assisted' });
    expect(h.saveGhost).not.toHaveBeenCalled();
  });

  it('still refuses the ghost after the score submit has read the claim', async () => {
    h.settings = assisted;
    await startAssistRun('u1', 'neon-driftway');
    h.settings = null;
    const scored = await submitGameScore({ ...run, keepAssistClaim: true });
    expect(scored).toMatchObject({ ok: true, ranked: false });
    const { json } = await postGhost();
    expect(json).toEqual({ saved: false, reason: 'assisted' });
    expect(h.saveGhost).not.toHaveBeenCalled();
  });

  it('stores no ghost while assisted settings are on, claim or not', async () => {
    h.settings = assisted;
    const { json } = await postGhost();
    expect(json).toEqual({ saved: false, reason: 'assisted' });
    expect(h.saveGhost).not.toHaveBeenCalled();
  });
});

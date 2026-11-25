/**
 * Vega's score route and assists (sprint 13 02), the mission-critical half: an assisted run, decided by
 * `consumeAssistRun` (the run claim) and never by the request body, leaves the player row alone, grants no
 * achievement, still counts as a play and answers `ranked: false`; an unassisted run ranks as before.
 * In-memory stand-ins; no database, no Redis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  assisted: false,
  consume: vi.fn(),
  player: null as null | Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  creates: [] as Array<Record<string, unknown>>,
  recordGamePlay: vi.fn(async () => {}),
  grant: vi.fn(async () => true),
}));

vi.mock('@/lib/api/implement.server', () => ({
  implement: (_contract: unknown, _options: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/game/assist-run.server', () => ({
  consumeAssistRun: (...args: unknown[]) => {
    h.consume(...args);
    return Promise.resolve(h.assisted);
  },
}));
vi.mock('@/lib/game/registry', () => ({ validateScore: () => ({ ok: true }) }));
vi.mock('@/lib/achievements/engine.server', () => ({ grantAchievement: h.grant }));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: h.recordGamePlay }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    vegaPlayer: {
      findUnique: async () => h.player,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        h.updates.push(data);
        return {
          highestLevel: Math.max(Number(h.player?.highestLevel ?? 0), Number(data.highestLevel)),
          highestLoop: 9,
        };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.creates.push(data);
        return { highestLevel: data.highestLevel, highestLoop: data.highestLoop };
      },
    },
  },
}));

import { route } from '../vega.score.server';

const post = (body: Record<string, unknown>) =>
  (
    route.handlers.POST as unknown as (a: {
      session: { user: { id: string; name: string; email: string } };
      body: Record<string, unknown>;
    }) => Promise<Response>
  )({ session: { user: { id: 'u1', name: 'Tester', email: 't@example.test' } }, body });

const facts = {
  integrityLost: 0,
  typesBuilt: ['SYNAPSE'],
  maxTier: 0,
  earlyCalls: 0,
  bossesKilled: 0,
  biobankIncome: 0,
};
const run = { score: 40, cleared: 1, map: 'intake', durationMs: 120_000, facts };

const existing = () => ({ highestLevel: 20, highestLoop: 3 });

beforeEach(() => {
  h.assisted = false;
  h.player = null;
  h.updates.length = 0;
  h.creates.length = 0;
  h.consume.mockClear();
  h.recordGamePlay.mockClear();
  h.grant.mockClear();
});

describe('Vega score: assisted runs', () => {
  it('asks the server about vega', async () => {
    h.player = existing();
    await post(run);
    expect(h.consume).toHaveBeenCalledWith('u1', 'vega');
  });

  it('ranks a plain run: the board columns move and the response says ranked', async () => {
    h.player = existing();
    const res = await post(run);
    expect(await res.json()).toMatchObject({ success: true, ranked: true, isRecord: true });
    expect(h.updates[0]).toMatchObject({ highestLevel: 40, highestLoop: 3 });
  });

  it('keeps an assisted run off the board: no write, no record, no achievement, but the play counts', async () => {
    h.assisted = true;
    h.player = existing();
    const res = await post(run);
    expect(await res.json()).toEqual({
      success: true,
      isRecord: false,
      bestScore: 20,
      bestWave: 3,
      unlocked: [],
      ranked: false,
    });
    expect(h.updates).toHaveLength(0);
    expect(h.creates).toHaveLength(0);
    expect(h.grant).not.toHaveBeenCalled();
    expect(h.recordGamePlay).toHaveBeenCalledWith('u1');
  });

  it('a first-ever assisted run creates no player row', async () => {
    h.assisted = true;
    const res = await post(run);
    expect(await res.json()).toMatchObject({ ranked: false, bestScore: 0, bestWave: 0 });
    expect(h.creates).toHaveLength(0);
  });

  it('ignores any assisted flag in the request: only the claim decides', async () => {
    h.player = existing();
    const res = await post({ ...run, assisted: false, ranked: true });
    expect(await res.json()).toMatchObject({ ranked: true });
    h.assisted = true;
    h.updates.length = 0;
    const res2 = await post({ ...run, assisted: false, ranked: true });
    expect(await res2.json()).toMatchObject({ ranked: false });
    expect(h.updates).toHaveLength(0);
  });

  it('still rejects an implausible score before the assisted branch', async () => {
    h.assisted = true;
    const res = await post({ ...run, score: 9_999_999 });
    expect(res.status).toBe(400);
    expect(h.recordGamePlay).not.toHaveBeenCalled();
  });
});

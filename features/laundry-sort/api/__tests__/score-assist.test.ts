/**
 * Laundry Sort's solo score route (sprint 09 17), the mission-critical half: an assisted run never
 * touches the player row (it IS this game's board), still counts as a play, and the response says
 * `ranked: false`; a plain run is ranked as before. The assisted decision is the server's, made by
 * `consumeAssistRun`, never the request body. In-memory stand-ins; no database, no Redis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  assisted: false,
  consume: vi.fn(),
  player: null as null | Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  creates: [] as Array<Record<string, unknown>>,
  recordGamePlay: vi.fn(async () => {}),
  reportGameResult: vi.fn(async () => {}),
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
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: h.recordGamePlay }));
vi.mock('@/lib/game/results.server', () => ({ reportGameResult: h.reportGameResult }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    laundryPlayer: {
      findUnique: async () => h.player,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        h.updates.push(data);
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.creates.push(data);
      },
    },
  },
}));

import { route } from '../laundry-sort.score.server';

const post = (body: Record<string, unknown>) =>
  (
    route.handlers.POST as unknown as (a: {
      session: { user: { id: string; name: string } };
      body: Record<string, unknown>;
    }) => Promise<Response>
  )({ session: { user: { id: 'u1', name: 'Tester' } }, body });

const run = { score: 400, sorted: 10, wrong: 0, missed: 0, bestCombo: 5, durationSec: 60, difficulty: 'normal' };

const existing = () => ({ id: 'p1', highScore: 100, bestCombo: 2 });

beforeEach(() => {
  h.assisted = false;
  h.player = null;
  h.updates.length = 0;
  h.creates.length = 0;
  h.consume.mockClear();
  h.recordGamePlay.mockClear();
  h.reportGameResult.mockClear();
});

describe('Laundry Sort score: assisted runs', () => {
  it('asks the server about laundry-sort, keeping the claim for the seeded and basket submits', async () => {
    h.player = existing();
    await post(run);
    expect(h.consume).toHaveBeenCalledWith('u1', 'laundry-sort', { keepClaim: true, settleClaim: true });
  });

  it('ranks a plain run: the high score moves', async () => {
    h.player = existing();
    const res = await post(run);
    expect(await res.json()).toEqual({ ok: true, personalBest: true, ranked: true });
    expect(h.updates[0]).toMatchObject({ highScore: 400 });
  });

  it('keeps an assisted run off the board: no write, no personal best, but the play counts', async () => {
    h.assisted = true;
    h.player = existing();
    const res = await post(run);
    expect(await res.json()).toEqual({ ok: true, personalBest: false, ranked: false });
    expect(h.updates).toHaveLength(0);
    expect(h.creates).toHaveLength(0);
    expect(h.recordGamePlay).toHaveBeenCalledWith('u1');
    expect(h.reportGameResult).toHaveBeenCalledWith('u1', { game: 'laundry-sort', score: 400 });
  });

  it('a first-ever assisted run creates no player row', async () => {
    h.assisted = true;
    const res = await post(run);
    expect(await res.json()).toMatchObject({ ranked: false });
    expect(h.creates).toHaveLength(0);
  });

  it('ignores any assisted flag in the request: only the server decides', async () => {
    h.player = existing();
    const res = await post({ ...run, assisted: false, ranked: true });
    expect(await res.json()).toMatchObject({ ranked: true });
    h.assisted = true;
    const res2 = await post({ ...run, assisted: false, ranked: true });
    expect(await res2.json()).toMatchObject({ ranked: false });
  });

  it('still rejects an implausible score before the assisted branch', async () => {
    h.assisted = true;
    const res = await post({ ...run, score: 999_999, sorted: 1 });
    expect(res.status).toBe(400);
    expect(h.recordGamePlay).not.toHaveBeenCalled();
  });
});

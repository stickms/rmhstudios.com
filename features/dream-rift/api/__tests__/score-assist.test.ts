/**
 * Dream Rift's own score module (sprint 08 06), the mission-critical half: an assisted run never moves
 * the high-score columns (they are this game's board), still counts as a play, and the response says
 * so (`ranked: false`); a plain run is ranked as before. In-memory stand-ins; no database, no Redis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  assisted: false,
  consume: vi.fn(),
  profile: null as null | Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  creates: [] as Array<Record<string, unknown>>,
  recordGamePlay: vi.fn(async () => {}),
}));

vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_options: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/game/assist-run.server', () => ({
  consumeAssistRun: (...args: unknown[]) => {
    h.consume(...args);
    return Promise.resolve(h.assisted);
  },
}));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: h.recordGamePlay }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    dreamRiftPlayer: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => ('userId' in where ? h.profile : null),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        h.updates.push(data);
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.creates.push(data);
      },
    },
    user: { findUnique: async () => ({ handle: 'tester', name: 'Tester' }) },
  },
}));

import { route } from '../dream-rift.score.server';

const post = (body: Record<string, unknown>) =>
  (route.handlers.POST as unknown as (a: { request: Request; userId: string }) => Promise<Response>)({
    request: new Request('http://test.local/api/dream-rift/score', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    userId: 'u1',
  });

const run = { score: 4000, difficulty: 'normal', stage: 3, character: 'rei', graze: 50, spellsCaptured: 2 };

const existing = () => ({
  id: 'p1',
  highScoreEasy: 0,
  highScoreNormal: 1000,
  highScoreHard: 0,
  highScoreLunatic: 0,
  bestStage: 1,
});

beforeEach(() => {
  h.assisted = false;
  h.profile = null;
  h.updates.length = 0;
  h.creates.length = 0;
  h.consume.mockClear();
  h.recordGamePlay.mockClear();
});

describe('Dream Rift score: assisted runs', () => {
  it('asks the assist layer about dream-rift, keeping the claim for the seeded submit that follows', async () => {
    h.profile = existing();
    await post(run);
    expect(h.consume).toHaveBeenCalledWith('u1', 'dream-rift', { keepClaim: true, settleClaim: true });
  });

  it('ranks a plain run: the high score and best stage move', async () => {
    h.profile = existing();
    const res = await post(run);
    expect(await res.json()).toMatchObject({ success: true, linked: true, ranked: true });
    expect(h.updates[0]).toMatchObject({ highScoreNormal: 4000, bestStage: 3 });
  });

  it('keeps an assisted run off the board but still counts the play', async () => {
    h.assisted = true;
    h.profile = existing();
    const res = await post(run);
    expect(await res.json()).toMatchObject({ success: true, linked: true, ranked: false });
    expect(h.updates).toHaveLength(1);
    const data = h.updates[0] ?? {};
    expect(data).not.toHaveProperty('highScoreNormal');
    expect(data).not.toHaveProperty('bestStage');
    expect(data).toMatchObject({ gamesPlayed: { increment: 1 } });
    expect(h.recordGamePlay).toHaveBeenCalledWith('u1');
  });

  it('a first-ever assisted run creates the profile with no score on the board', async () => {
    h.assisted = true;
    const res = await post(run);
    expect(await res.json()).toMatchObject({ success: true, created: true, ranked: false });
    const data = h.creates[0] ?? {};
    expect(data).not.toHaveProperty('highScoreNormal');
    expect(data).not.toHaveProperty('bestStage');
    expect(data).toMatchObject({ gamesPlayed: 1 });
  });

  it('a first-ever plain run creates the profile with its score', async () => {
    const res = await post(run);
    expect(await res.json()).toMatchObject({ created: true, ranked: true });
    expect(h.creates[0]).toMatchObject({ highScoreNormal: 4000, bestStage: 3 });
  });
});

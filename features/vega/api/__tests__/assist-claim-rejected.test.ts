/**
 * s14-20 (f): a rejected Vega run spends the assist claim. The claim is consumed before the run is judged, so a
 * refused run (invalid score, over the map's ceiling) cannot leave a claim behind for a re-POST to dodge.
 * In-memory stand-ins; no database, no Redis.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  order: [] as string[],
  claimed: true,
  valid: true,
  writes: 0,
}));

vi.mock('@/lib/api/implement.server', () => ({
  implement: (_contract: unknown, _options: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/game/assist-run.server', () => ({
  // Like the real function: reading the claim clears it, so a second call finds none.
  consumeAssistRun: async () => {
    h.order.push('consume');
    const had = h.claimed;
    h.claimed = false;
    return had;
  },
}));
vi.mock('@/lib/game/registry', () => ({
  validateScore: () => {
    h.order.push('validate');
    return { ok: h.valid };
  },
}));
vi.mock('@/lib/achievements/engine.server', () => ({ grantAchievement: vi.fn(async () => true) }));
vi.mock('@/lib/quests/engine.server', () => ({ recordGamePlay: vi.fn(async () => {}) }));
vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      vegaPlayer: {
        findUnique: async () => null,
        update: async () => {
          h.writes++;
          return { highestLevel: 40, highestLoop: 1 };
        },
        create: async () => {
          h.writes++;
          return { highestLevel: 40, highestLoop: 1 };
        },
      },
    }),
  };
});

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

beforeEach(() => {
  h.order.length = 0;
  h.claimed = true;
  h.valid = true;
  h.writes = 0;
});

describe('Vega score: a rejected run and the assist claim', () => {
  it('consumes the claim before it judges the run', async () => {
    h.valid = false;
    await post(run);
    expect(h.order).toEqual(['consume', 'validate']);
  });

  it('refuses the run and leaves no claim behind, so the re-POST is not treated as assisted by it', async () => {
    h.valid = false;
    expect((await post(run)).status).toBe(400);
    expect(h.claimed).toBe(false);

    // Assists are now off and the claim is gone: the same run, valid this time, ranks.
    h.valid = true;
    const second = await post(run);
    const body = (await second.json()) as { ranked: boolean };
    expect(body.ranked).toBe(true);
    expect(h.writes).toBe(1);
  });

  it('a score over the map ceiling is refused and spends the claim too', async () => {
    const res = await post({ ...run, score: 10_000_000 });
    expect(res.status).toBe(400);
    expect(h.claimed).toBe(false);
    expect(h.writes).toBe(0);
  });

  it('a valid assisted run is still unranked', async () => {
    const body = (await (await post(run)).json()) as { ranked: boolean };
    expect(body.ranked).toBe(false);
    expect(h.writes).toBe(0);
  });
});

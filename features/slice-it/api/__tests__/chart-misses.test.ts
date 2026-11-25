/**
 * Slice It — `GET /api/slice-it/charts/$id/misses`, the mission-critical half: only the chart's author reads where
 * players miss it (404 for everyone else, drafts included, so the route reveals nothing), only the chart's current
 * hash is read, and under five sampled runs there is no heat to show. In-memory stand-ins, no database.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  chart: null as null | Record<string, unknown>,
  stats: [] as { noteMs: number; attempts: number; misses: number }[],
  statWhere: [] as unknown[],
  session: null as null | { user: { id: string } },
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/storage/s3.server', () => ({ listObjects: async () => [] }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    chart: { findUnique: async () => h.chart },
    sliceNoteStat: {
      findMany: async (args: { where: unknown }) => {
        h.statWhere.push(args.where);
        return h.stats;
      },
    },
  },
}));

import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { route } from '@features/slice-it/api/slice-it.charts.$id.misses.server';

const handlers = handlersOf(route);
const HASH = 'b'.repeat(64);

async function read(id = 'chart-1') {
  const request = new Request(`https://rmhstudios.com/api/slice-it/charts/${id}/misses`, {
    headers: { cookie: 'better-auth.session_token=abc', 'cf-connecting-ip': `${Math.random()}` },
  });
  const response = await handlers.GET!({ request, params: { id } });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

/** `runs` sampled runs over three notes, the second missed by half of them. */
function statsFor(runs: number) {
  return [
    { noteMs: 1000, attempts: runs, misses: 0 },
    { noteMs: 30_000, attempts: runs, misses: Math.floor(runs / 2) },
    { noteMs: 59_000, attempts: runs, misses: runs },
  ];
}

beforeEach(() => {
  h.session = { user: { id: 'author' } };
  h.chart = { id: 'chart-1', authorId: 'author', chartHash: HASH, song: { duration: 60 } };
  h.stats = statsFor(10);
  h.statWhere.length = 0;
});

describe('who may read the misses', () => {
  it('gives the author the heat', async () => {
    const { status, json } = await read();
    expect(status).toBe(200);
    expect(json.chartHash).toBe(HASH);
    expect(json.sampledRuns).toBe(10);
  });

  it('answers another member with the 404 a missing chart gets', async () => {
    h.session = { user: { id: 'someone-else' } };
    const { status } = await read();
    expect(status).toBe(404);
    expect(h.statWhere).toEqual([]);
  });

  it('answers another member the same way for a draft', async () => {
    h.session = { user: { id: 'someone-else' } };
    h.chart = { ...h.chart, status: 'draft' };
    expect((await read()).status).toBe(404);
  });

  it('answers 404 for a chart that does not exist', async () => {
    h.chart = null;
    expect((await read('nope')).status).toBe(404);
  });

  it('refuses a signed-out caller', async () => {
    h.session = null;
    const { status } = await read();
    expect([401, 403]).toContain(status);
    expect(h.statWhere).toEqual([]);
  });
});

describe('what is read', () => {
  it('reads the chart’s current hash only', async () => {
    await read();
    expect(h.statWhere).toEqual([{ chartId: 'chart-1', chartHash: HASH }]);
  });

  it('buckets the chart over the song and lists each note’s rate', async () => {
    const { json } = await read();
    const buckets = json.buckets as {
      from: number;
      to: number;
      attempts: number;
      misses: number;
      rate: number | null;
    }[];
    expect(buckets).toHaveLength(64);
    expect(buckets[1]).toMatchObject({ attempts: 10, misses: 0, rate: 0 });
    expect(buckets[32]).toMatchObject({ attempts: 10, misses: 5, rate: 0.5 });
    expect(buckets[62]).toMatchObject({ attempts: 10, misses: 10, rate: 1 });
    expect(buckets[10]!.rate).toBeNull();
    expect(json.notes).toEqual([
      { noteMs: 1000, rate: 0 },
      { noteMs: 30_000, rate: 0.5 },
      { noteMs: 59_000, rate: 1 },
    ]);
  });

  it('shows the heat from five sampled runs', async () => {
    h.stats = statsFor(5);
    const { json } = await read();
    expect(json.sampledRuns).toBe(5);
    expect((json.buckets as unknown[]).length).toBe(64);
  });

  it('returns no buckets and no notes under five sampled runs, but says how many there are', async () => {
    h.stats = statsFor(4);
    const { json } = await read();
    expect(json).toEqual({ chartHash: HASH, sampledRuns: 4, buckets: [], notes: [] });
  });

  it('returns the same empty answer for a chart nobody has played', async () => {
    h.stats = [];
    const { json } = await read();
    expect(json).toEqual({ chartHash: HASH, sampledRuns: 0, buckets: [], notes: [] });
  });
});

/**
 * Slice It chart history, the mission-critical half: only the chart's author reads a revision's notes, a revision of
 * another chart (or one that was pruned) is "no longer kept", the list never selects `notes`, and a saved version's
 * name is validated and written with the revision. In-memory stand-ins; no database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  chart: null as null | Record<string, unknown>,
  revision: null as null | Record<string, unknown>,
  revisionWhere: [] as Array<Record<string, unknown>>,
  revisionSelect: [] as Array<Record<string, unknown>>,
  created: [] as Array<Record<string, unknown>>,
  rawSql: [] as string[],
  lintErrors: false,
}));

vi.mock('@/lib/api/handler.server', () => ({ defineHandler: (_options: unknown, fn: unknown) => fn }));
vi.mock('@/lib/api/implement.server', () => ({
  implement: (_contract: unknown, _options: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/prisma.server', () => {
  const tx = {
    chart: {
      update: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'chart-1',
        songId: 's1',
        authorId: 'u1',
        difficulty: 'hard',
        keys: 2,
        name: 'Hard',
        status: (h.chart?.status as string) ?? 'draft',
        rating: null,
        isGenerated: false,
        generatorVersion: null,
        chartHash: data.chartHash,
        updatedAt: new Date('2026-11-20T10:00:00Z'),
      }),
    },
    chartRevision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.created.push(data);
        return data;
      },
    },
  };
  return {
    prisma: {
      chart: { findUnique: async () => h.chart },
      chartRevision: {
        findFirst: async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
          h.revisionWhere.push(args.where);
          h.revisionSelect.push(args.select);
          // The query names this chart: a revision stored under another chart is not found.
          return h.revision && h.revision.chartId === args.where.chartId ? h.revision : null;
        },
      },
      $queryRaw: async (strings: TemplateStringsArray) => {
        h.rawSql.push(strings.join('?'));
        return [];
      },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock('@features/slice-it/engine/rating.server', () => ({ rateAndStoreChart: async () => null }));
vi.mock('@features/slice-it/engine/progression.server', () => ({ recordChartPublished: async () => {} }));
vi.mock('@features/slice-it/engine/editor/lint', () => ({
  lintWireChart: () => (h.lintErrors ? [{ severity: 'error', code: 'unhittable-jack' }] : []),
}));

import { ChartPatchZ } from '../../engine/editor/api-schemas';
import { route as listRoute } from '../slice-it.charts.$id.revisions.server';
import { route as oneRoute } from '../slice-it.charts.$id.revisions.$revisionId.server';
import { route as chartRoute } from '../slice-it.charts.$id.server';

type Ctx = { userId: string; params: Record<string, string>; body?: unknown; query?: unknown };
const call = (route: { handlers: object }, method: string, ctx: Ctx) =>
  (route.handlers as Record<string, (c: Ctx) => Promise<Response>>)[method]!(ctx);

const getOne = (userId: string, revisionId: string, id = 'chart-1') =>
  call(oneRoute, 'GET', { userId, params: { id, revisionId } });

const NOTES = [{ id: 'n1', time: 1, type: 'STANDARD', lane: 0 }];

beforeEach(() => {
  h.chart = { id: 'chart-1', authorId: 'u1', status: 'draft' };
  h.revision = {
    id: 7n,
    chartId: 'chart-1',
    kind: 'manual',
    label: 'Before the bridge',
    createdAt: new Date('2026-11-20T09:30:00Z'),
    notes: NOTES,
  };
  h.revisionWhere.length = 0;
  h.revisionSelect.length = 0;
  h.created.length = 0;
  h.rawSql.length = 0;
  h.lintErrors = false;
});

describe('GET /api/slice-it/charts/$id/revisions/$revisionId', () => {
  it('returns one revision with its notes to the author', async () => {
    const res = await getOne('u1', '7');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: '7',
      kind: 'manual',
      label: 'Before the bridge',
      createdAt: '2026-11-20T09:30:00.000Z',
      notes: NOTES,
    });
    expect(h.revisionWhere[0]).toEqual({ id: 7n, chartId: 'chart-1' });
  });

  it('an unknown chart is 404', async () => {
    h.chart = null;
    expect((await getOne('u1', '7')).status).toBe(404);
  });

  it("another member's chart is 403, exactly as the list answers", async () => {
    const res = await getOne('u2', '7');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Not yours' });
    const list = await call(listRoute, 'GET', { userId: 'u2', params: { id: 'chart-1' }, query: { limit: 20 } });
    expect(list.status).toBe(403);
    expect(await list.json()).toEqual({ error: 'Not yours' });
    // Nothing was read for the other member.
    expect(h.revisionWhere).toHaveLength(0);
  });

  it("a revision of a different chart under this chart's path is 404 and no longer kept", async () => {
    h.revision = { ...h.revision, chartId: 'chart-2' };
    const res = await getOne('u1', '7');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'CHART_REVISION_GONE', error: 'That version is no longer kept' });
  });

  it('a pruned revision is the same refusal', async () => {
    h.revision = null;
    const res = await getOne('u1', '7');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'CHART_REVISION_GONE' });
  });

  it('an id that is not a revision number is refused without a query', async () => {
    for (const bad of ['abc', '-1', '1.5', '', '9'.repeat(30)]) {
      const res = await getOne('u1', bad);
      expect(res.status).toBe(404);
    }
    expect(h.revisionWhere).toHaveLength(0);
  });
});

describe('the revision list', () => {
  it('never selects notes, only counts them in the database', async () => {
    const res = await call(listRoute, 'GET', { userId: 'u1', params: { id: 'chart-1' }, query: { limit: 50 } });
    expect(res.status).toBe(200);
    const sql = h.rawSql[0] ?? '';
    expect(sql).toContain('jsonb_array_length("notes")');
    expect(sql).not.toMatch(/SELECT[^;]*"notes",/);
    expect(sql).toContain('FROM "ChartRevision"');
  });

  it('the revision read for one version selects notes (it is the only reader that does)', async () => {
    await getOne('u1', '7');
    expect(h.revisionSelect[0]).toMatchObject({ notes: true });
  });
});

describe('the label of a saved version', () => {
  const body = (extra: Record<string, unknown>) => ({ notes: NOTES, ...extra });

  it('is 1 to 120 characters after trimming, and only with a manual save', () => {
    expect(ChartPatchZ.safeParse(body({ kind: 'manual', label: 'Before the bridge' })).success).toBe(true);
    expect(ChartPatchZ.safeParse(body({ kind: 'manual', label: 'x'.repeat(120) })).success).toBe(true);
    expect(ChartPatchZ.safeParse(body({ kind: 'manual', label: 'x'.repeat(121) })).success).toBe(false);
    expect(ChartPatchZ.safeParse(body({ kind: 'manual', label: '   ' })).success).toBe(false);
    expect(ChartPatchZ.safeParse(body({ kind: 'manual', label: '' })).success).toBe(false);
    expect(ChartPatchZ.safeParse(body({ kind: 'autosave', label: 'nope' })).success).toBe(false);
    expect(ChartPatchZ.safeParse(body({ kind: 'publish', label: 'nope' })).success).toBe(false);
    expect(ChartPatchZ.safeParse(body({ label: 'no kind' })).success).toBe(false);
  });

  it('trims the name', () => {
    const parsed = ChartPatchZ.safeParse(body({ kind: 'manual', label: '  Chorus done  ' }));
    expect(parsed.success && parsed.data.label).toBe('Chorus done');
  });

  it('a save without a label is unchanged', () => {
    expect(ChartPatchZ.safeParse(body({})).success).toBe(true);
    expect(ChartPatchZ.safeParse(body({ kind: 'manual' })).success).toBe(true);
  });

  it('the PATCH writes the label on the revision row, and no label on an autosave', async () => {
    await call(chartRoute, 'PATCH', {
      userId: 'u1',
      params: { id: 'chart-1' },
      body: { notes: NOTES, kind: 'manual', label: 'Chorus done' },
    });
    expect(h.created[0]).toMatchObject({ chartId: 'chart-1', kind: 'manual', label: 'Chorus done' });

    await call(chartRoute, 'PATCH', { userId: 'u1', params: { id: 'chart-1' }, body: { notes: NOTES } });
    expect(h.created[1]).toMatchObject({ kind: 'autosave' });
    expect(h.created[1]).not.toHaveProperty('label');
  });

  it("a published chart's lint still applies to a save: errors refuse it and write no revision", async () => {
    h.chart = {
      id: 'chart-1',
      authorId: 'u1',
      status: 'public',
      songId: 's1',
      difficulty: 'hard',
      song: { duration: 120, bpm: 120 },
    };
    h.lintErrors = true;
    const res = await call(chartRoute, 'PATCH', {
      userId: 'u1',
      params: { id: 'chart-1' },
      body: { notes: NOTES, kind: 'manual' },
    });
    expect(res.status).toBe(422);
    expect(h.created).toHaveLength(0);
  });
});

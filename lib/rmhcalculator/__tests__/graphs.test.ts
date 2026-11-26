import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { ERROR_CODES } from '@/lib/errors/codes';
import { CALC_GRAPH_LIMIT, createCalcGraphBody, updateCalcGraphBody } from '@/lib/rmhcalculator/graphs-schema';

/**
 * s15-08: saved RMHCalculator graphs. Ownership on every route, the 50-graph cap under the per-member lock, a result
 * stored only after it validates (and read back as `null` when it no longer does), the export and the erasure. The
 * database is a small in-memory fake wrapped in `shapeChecked`, so a query Postgres would reject fails here too.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  graphs: [] as Row[],
  notebooks: [] as Row[],
  nextId: 1,
  /** Per-key lock chains: a held lock makes the next `lockKey` on that key wait for the transaction to end. */
  locks: new Map<string, Promise<void>>(),
  lockedKeys: [] as string[],
  options: new Map<string, Record<string, unknown>>(),
  deleteMany: undefined as unknown as ReturnType<typeof vi.fn>,
}));

const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
const pick = (row: Row, select?: Record<string, boolean>) =>
  select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const calcGraph = {
  findMany: vi.fn(
    async ({
      where,
      orderBy,
      take,
      select,
    }: {
      where: Row;
      orderBy?: { updatedAt?: string; createdAt?: string };
      take?: number;
      select?: Record<string, boolean>;
    }) => {
      let rows = h.graphs.filter((r) => matches(r, where));
      const key = orderBy?.updatedAt ? 'updatedAt' : 'createdAt';
      const dir = (orderBy?.updatedAt ?? orderBy?.createdAt) === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => dir * ((a[key] as Date).getTime() - (b[key] as Date).getTime()));
      return rows.slice(0, take).map((r) => pick(r, select));
    },
  ),
  findFirst: vi.fn(async ({ where, select }: { where: Row; select?: Record<string, boolean> }) => {
    const row = h.graphs.find((r) => matches(r, where));
    return row ? pick(row, select) : null;
  }),
  count: vi.fn(async ({ where }: { where: Row }) => {
    await tick();
    return h.graphs.filter((r) => matches(r, where)).length;
  }),
  create: vi.fn(async ({ data, select }: { data: Row; select?: Record<string, boolean> }) => {
    await tick();
    const now = new Date(1_700_000_000_000 + h.nextId * 1000);
    const row = { id: `g${h.nextId++}`, createdAt: now, updatedAt: now, ...data };
    h.graphs.push(row);
    return pick(row, select);
  }),
  updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const hit = h.graphs.filter((r) => matches(r, where));
    for (const r of hit) Object.assign(r, data, { updatedAt: new Date(1_800_000_000_000) });
    return { count: hit.length };
  }),
  deleteMany: vi.fn(async ({ where }: { where: Row }) => {
    const gone = h.graphs.filter((r) => matches(r, where));
    h.graphs = h.graphs.filter((r) => !matches(r, where));
    return { count: gone.length };
  }),
};
const calcNotebook = {
  findMany: vi.fn(async ({ where, select }: { where: Row; select?: Record<string, boolean> }) =>
    h.notebooks.filter((r) => matches(r, where)).map((r) => pick(r, select)),
  ),
};

/** `lockKey` is `tx.$executeRaw` of a `pg_advisory_xact_lock`: hold the key until the transaction finishes. */
function makeTx(held: Array<() => void>) {
  return {
    calcGraph,
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, key: string) => {
      expect(strings.join('?')).toContain('pg_advisory_xact_lock');
      h.lockedKeys.push(key);
      const before = h.locks.get(key) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((resolve) => (release = resolve));
      h.locks.set(
        key,
        before.then(() => mine),
      );
      held.push(release);
      await before;
    }),
  };
}

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      calcGraph,
      calcNotebook,
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const held: Array<() => void> = [];
        try {
          return await fn(makeTx(held));
        } finally {
          for (const release of held) release();
        }
      },
    }),
  };
});
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (options: Record<string, unknown>, fn: Record<string, unknown>) => {
    h.options.set(String(options.label), options);
    return fn;
  },
}));

const result = (n = 3) => ({
  view: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
  xTicks: [-1, 0, 1],
  yTicks: [-1, 0, 1],
  series: [
    {
      expression: 'sin(x)',
      points: Array.from({ length: n }, (_, i): [number, number | null] => [i, i === 1 ? null : i]),
    },
  ],
  notes: 'ok',
});
const input = (over: Record<string, unknown> = {}) => ({
  title: 'Sine',
  functions: ['sin(x)'],
  domainMin: null,
  domainMax: null,
  result: result(),
  ...over,
});
const row = (id: string, userId: string, over: Row = {}): Row => ({
  id,
  userId,
  title: `Graph ${id}`,
  functions: ['x^2'],
  domainMin: -5,
  domainMax: 5,
  result: result(),
  createdAt: new Date('2027-01-01T00:00:00Z'),
  updatedAt: new Date('2027-01-02T00:00:00Z'),
  ...over,
});

type Handler = (a: { userId: string; params?: Record<string, string>; body?: unknown }) => Promise<Response>;
async function routes() {
  const list = (await import('@/lib/rmhcalculator/api/rmhcalculator.graphs.server')).route.handlers as Record<
    string,
    Handler
  >;
  const one = (await import('@/lib/rmhcalculator/api/rmhcalculator.graphs.$id.server')).route.handlers as Record<
    string,
    Handler
  >;
  return { list, one };
}
async function json(res: Response) {
  const body = (await res.json()) as Record<string, unknown>;
  assertJsonSafe(body);
  return body;
}

beforeEach(() => {
  h.graphs = [];
  h.notebooks = [];
  h.nextId = 1;
  h.locks = new Map();
  h.lockedKeys = [];
  vi.clearAllMocks();
});

describe('ownership: every route is scoped to the caller', () => {
  beforeEach(() => {
    h.graphs = [row('mine', 'u1'), row('theirs', 'u2')];
  });

  it('the list holds only the caller’s graphs, without their points', async () => {
    const { list } = await routes();
    const body = await json(await list.GET!({ userId: 'u1' }));
    expect((body.graphs as Row[]).map((g) => g.id)).toEqual(['mine']);
    expect(body.graphs).toEqual([expect.not.objectContaining({ result: expect.anything() })]);
    expect(calcGraph.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
  });

  it('lists newest first', async () => {
    h.graphs = [
      row('old', 'u1', { updatedAt: new Date('2027-01-01T00:00:00Z') }),
      row('new', 'u1', { updatedAt: new Date('2027-02-01T00:00:00Z') }),
    ];
    const { list } = await routes();
    const body = await json(await list.GET!({ userId: 'u1' }));
    expect((body.graphs as Row[]).map((g) => g.id)).toEqual(['new', 'old']);
  });

  it('GET of another member’s graph is a 404 and names nothing', async () => {
    const { one } = await routes();
    const res = await one.GET!({ userId: 'u1', params: { id: 'theirs' } });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await json(res))).not.toContain('Graph theirs');
    const own = await one.GET!({ userId: 'u1', params: { id: 'mine' } });
    expect(own.status).toBe(200);
    expect(((await json(own)).graph as Row).title).toBe('Graph mine');
  });

  it('PUT of another member’s graph changes nothing and is a 404', async () => {
    const { one } = await routes();
    const res = await one.PUT!({ userId: 'u1', params: { id: 'theirs' }, body: { title: 'Mine now' } });
    expect(res.status).toBe(404);
    expect(h.graphs.find((g) => g.id === 'theirs')!.title).toBe('Graph theirs');
    expect(calcGraph.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'theirs', userId: 'u1' } }),
    );
  });

  it('DELETE of another member’s graph removes nothing and is a 404', async () => {
    const { one } = await routes();
    const res = await one.DELETE!({ userId: 'u1', params: { id: 'theirs' } });
    expect(res.status).toBe(404);
    expect(h.graphs.map((g) => g.id).sort()).toEqual(['mine', 'theirs']);
    const own = await one.DELETE!({ userId: 'u1', params: { id: 'mine' } });
    expect(own.status).toBe(200);
    expect(h.graphs.map((g) => g.id)).toEqual(['theirs']);
  });

  it('a created graph belongs to the caller, whatever the body says', async () => {
    const { list } = await routes();
    const res = await list.POST!({ userId: 'u1', body: { ...input(), userId: 'u2' } });
    expect(res.status).toBe(200);
    const { id } = (await json(res)) as { id: string };
    expect(h.graphs.find((g) => g.id === id)!.userId).toBe('u1');
  });
});

describe('the cap of 50 graphs', () => {
  const fill = (userId: string, n: number) => {
    h.graphs = Array.from({ length: n }, (_, i) => row(`${userId}-${i}`, userId));
  };

  it('the 50th is saved and the 51st is refused with the limit sentence', async () => {
    const { list } = await routes();
    fill('u1', CALC_GRAPH_LIMIT - 1);
    expect((await list.POST!({ userId: 'u1', body: input() })).status).toBe(200);
    expect(h.graphs).toHaveLength(CALC_GRAPH_LIMIT);
    const res = await list.POST!({ userId: 'u1', body: input() });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body).toMatchObject({ code: 'CALC_GRAPH_LIMIT', max: CALC_GRAPH_LIMIT });
    expect(body.error).toBe(ERROR_CODES.CALC_GRAPH_LIMIT.text.replace('{{max}}', String(CALC_GRAPH_LIMIT)));
    expect(h.graphs).toHaveLength(CALC_GRAPH_LIMIT);
  });

  it('counts only the caller’s own graphs', async () => {
    const { list } = await routes();
    fill('u2', CALC_GRAPH_LIMIT);
    expect((await list.POST!({ userId: 'u1', body: input() })).status).toBe(200);
  });

  it('takes the per-member lock before it counts', async () => {
    const { list } = await routes();
    await list.POST!({ userId: 'u7', body: input() });
    expect(h.lockedKeys).toEqual(['calc-graphs:u7']);
  });

  it('two saves racing for the last place leave exactly 50', async () => {
    const { list } = await routes();
    fill('u1', CALC_GRAPH_LIMIT - 1);
    const [a, b] = await Promise.all([
      list.POST!({ userId: 'u1', body: input({ title: 'A' }) }),
      list.POST!({ userId: 'u1', body: input({ title: 'B' }) }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(h.graphs.filter((g) => g.userId === 'u1')).toHaveLength(CALC_GRAPH_LIMIT);
  });
});

describe('the stored result is trusted only after it validates', () => {
  it('a result that is not a graph is refused and nothing is stored', async () => {
    const { list } = await routes();
    for (const bad of [
      {},
      { ...result(), series: [] },
      { ...result(), series: [{ expression: 'x', points: [['a', 1]] }] },
      null,
    ]) {
      const res = await list.POST!({ userId: 'u1', body: input({ result: bad }) });
      expect(res.status).toBe(400);
      assertJsonSafe(await res.json());
    }
    expect(h.graphs).toHaveLength(0);
  });

  it('a re-plot with an invalid result is refused and the row keeps its old points', async () => {
    h.graphs = [row('mine', 'u1')];
    const { one } = await routes();
    const res = await one.PUT!({ userId: 'u1', params: { id: 'mine' }, body: { result: { view: 1 } } });
    expect(res.status).toBe(400);
    expect(h.graphs[0]!.result).toEqual(result());
  });

  it('stores the validated result (ticks defaulted), a re-plot replaces it, a rename leaves it', async () => {
    const { list, one } = await routes();
    const { id } = (await json(await list.POST!({ userId: 'u1', body: input() }))) as { id: string };
    expect(h.graphs[0]!.result).toMatchObject({ series: [{ expression: 'sin(x)' }] });

    const replot = { ...result(5), notes: 'again' };
    expect(
      (
        await one.PUT!({
          userId: 'u1',
          params: { id },
          body: { functions: ['sin(x)'], domainMin: -2, domainMax: 2, result: replot },
        })
      ).status,
    ).toBe(200);
    expect(h.graphs[0]).toMatchObject({ domainMin: -2, domainMax: 2, result: { notes: 'again' } });

    expect((await one.PUT!({ userId: 'u1', params: { id }, body: { title: 'Renamed' } })).status).toBe(200);
    expect(h.graphs[0]).toMatchObject({ title: 'Renamed', result: { notes: 'again' } });
  });

  it('a row whose stored result no longer parses opens as result: null ("Plot again")', async () => {
    h.graphs = [row('old', 'u1', { result: { series: 'from an older shape' } })];
    const { one } = await routes();
    const body = await json(await one.GET!({ userId: 'u1', params: { id: 'old' } }));
    expect(body.graph).toMatchObject({ id: 'old', functions: ['x^2'], result: null });
  });

  it('every write route refuses a body over 64 KB and every read is private', async () => {
    await routes();
    const opt = (label: string) => h.options.get(label)!;
    expect(opt('POST /api/rmhcalculator/graphs').maxBodyBytes).toBe(64 * 1024);
    expect(opt('PUT /api/rmhcalculator/graphs/$id').maxBodyBytes).toBe(64 * 1024);
    expect(opt('POST /api/rmhcalculator/graphs').body).toBe(createCalcGraphBody);
    expect(opt('PUT /api/rmhcalculator/graphs/$id').body).toBe(updateCalcGraphBody);
    expect(opt('GET /api/rmhcalculator/graphs').cache).toMatchObject({ visibility: 'private' });
    expect(opt('GET /api/rmhcalculator/graphs/$id').cache).toMatchObject({ visibility: 'private' });
    for (const label of [
      'POST /api/rmhcalculator/graphs',
      'PUT /api/rmhcalculator/graphs/$id',
      'DELETE /api/rmhcalculator/graphs/$id',
    ]) {
      expect(opt(label).rateLimit).toBe('write');
    }
  });
});

describe('the request schemas', () => {
  it('accept one to four functions of up to 200 characters', () => {
    expect(createCalcGraphBody.safeParse(input()).success).toBe(true);
    expect(createCalcGraphBody.safeParse(input({ functions: ['a', 'b', 'c', 'd'] })).success).toBe(true);
    expect(createCalcGraphBody.safeParse(input({ functions: ['x'.repeat(200)] })).success).toBe(true);
  });

  it('refuse none, five, an empty one, an over-long one, a long title and no title', () => {
    for (const bad of [
      { functions: [] },
      { functions: ['a', 'b', 'c', 'd', 'e'] },
      { functions: ['   '] },
      { functions: ['x'.repeat(201)] },
      { title: 'x'.repeat(81) },
      { title: '  ' },
    ]) {
      expect(createCalcGraphBody.safeParse(input(bad)).success, JSON.stringify(bad).slice(0, 40)).toBe(false);
    }
  });

  it('take a domain with both ends and a larger maximum, or none', () => {
    expect(createCalcGraphBody.safeParse(input({ domainMin: -3, domainMax: 3 })).success).toBe(true);
    for (const bad of [
      { domainMin: 3, domainMax: -3 },
      { domainMin: 1, domainMax: 1 },
      { domainMin: 1, domainMax: null },
      { domainMin: null, domainMax: 1 },
      { domainMin: Number.POSITIVE_INFINITY, domainMax: 1 },
    ]) {
      expect(createCalcGraphBody.safeParse(input(bad)).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('an update needs something to change, and a domain end never travels alone', () => {
    expect(updateCalcGraphBody.safeParse({}).success).toBe(false);
    expect(updateCalcGraphBody.safeParse({ title: 'New' }).success).toBe(true);
    expect(updateCalcGraphBody.safeParse({ domainMin: 1 }).success).toBe(false);
    expect(updateCalcGraphBody.safeParse({ domainMin: 2, domainMax: 1 }).success).toBe(false);
    expect(updateCalcGraphBody.safeParse({ domainMin: null, domainMax: null }).success).toBe(true);
  });
});

describe('the data export and account erasure', () => {
  it('exports graphs (no points) and notebooks for the member only', async () => {
    h.graphs = [row('mine', 'u1'), row('theirs', 'u2')];
    h.notebooks = [
      {
        id: 'n1',
        userId: 'u1',
        title: 'Rent',
        body: 'rent = 1',
        createdAt: new Date('2027-01-01T00:00:00Z'),
        updatedAt: new Date('2027-01-03T00:00:00Z'),
      },
      { id: 'n2', userId: 'u2', title: 'Theirs', body: 'x', createdAt: new Date(), updatedAt: new Date() },
    ];
    const { exportCalcTools } = await import('@/lib/rmhcalculator/graphs.server');
    const out = await exportCalcTools('u1');
    assertJsonSafe(out);
    expect(out).toEqual({
      graphs: [
        {
          title: 'Graph mine',
          functions: ['x^2'],
          domainMin: -5,
          domainMax: 5,
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-02T00:00:00.000Z',
        },
      ],
      notebooks: [
        {
          title: 'Rent',
          body: 'rent = 1',
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-03T00:00:00.000Z',
        },
      ],
    });
    expect(JSON.stringify(out)).not.toContain('points');
  });

  it('the erasure operation deletes every graph of the member and no one else’s', async () => {
    h.graphs = [row('a', 'u1'), row('b', 'u1'), row('c', 'u2')];
    const { calcGraphErasureOps } = await import('@/lib/rmhcalculator/graphs.server');
    const ops = calcGraphErasureOps('u1');
    expect(ops).toHaveLength(1);
    await Promise.all(ops);
    expect(calcGraph.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(h.graphs.map((g) => g.id)).toEqual(['c']);
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { assertJsonSafe, assertQueryShape, queryShapeProblems, schemaModels, shapeChecked } from '@/lib/db/query-shape';

const ROOT = resolve(__dirname, '../../..');
const problems = queryShapeProblems;

describe('the schema map', () => {
  it('agrees with Prisma.dmmf on every model and every field', () => {
    const runtime = Prisma.dmmf.datamodel.models;
    const parsed = schemaModels();
    expect([...parsed.keys()].sort()).toEqual(runtime.map((m) => m.name).sort());
    for (const model of runtime) {
      const mine = parsed.get(model.name)!;
      expect([...mine.fields.keys()].sort(), model.name).toEqual(model.fields.map((f) => f.name).sort());
      for (const f of model.fields) {
        const p = mine.fields.get(f.name)!;
        expect({ type: p.type, kind: p.kind }, `${model.name}.${f.name}`).toEqual({
          type: f.type,
          kind: f.kind,
        });
      }
    }
  });

  it('reads optionality and list-ness, which the runtime model leaves out', () => {
    const models = schemaModels();
    expect(models.get('SliceRun')!.fields.get('accuracy')).toMatchObject({ optional: false, list: false });
    expect(models.get('SliceRun')!.fields.get('chartId')).toMatchObject({ optional: true });
    expect(models.get('LadderJob')!.fields.get('skills')).toMatchObject({ type: 'String', list: true });
    expect(models.get('LadderJob')!.fields.get('applications')).toMatchObject({ kind: 'object', list: true });
    expect(models.get('LadderJob')!.fields.has('updatedAt')).toBe(false);
  });

  it('reads compound unique keys', () => {
    expect(schemaModels().get('UserBlock')!.compound.get('blockerId_blockedId')).toEqual(['blockerId', 'blockedId']);
  });
});

describe('where', () => {
  it('rejects a field the model does not have, naming the model and the field', () => {
    const [p] = problems('SliceRun', 'findMany', { where: { nope: 1 } });
    expect(p).toContain('SliceRun.findMany');
    expect(p).toContain('where.nope');
    expect(p).toContain('no field "nope"');
  });

  it('rejects { not: null } on a required column and names the rule', () => {
    const [p] = problems('SliceRun', 'findMany', { where: { accuracy: { not: null } } });
    expect(p).toContain('where.accuracy.not');
    expect(p).toContain('SliceRun.accuracy');
    expect(p).toContain('required column');
  });

  it('rejects { equals: null } and a bare null on a required column', () => {
    expect(problems('SliceRun', 'findMany', { where: { accuracy: { equals: null } } })).toHaveLength(1);
    expect(problems('SliceRun', 'count', { where: { userId: null } })).toHaveLength(1);
  });

  it('accepts null comparisons on an optional column', () => {
    expect(problems('SliceRun', 'findMany', { where: { chartId: { not: null } } })).toEqual([]);
    expect(problems('SliceRun', 'findMany', { where: { chartId: null } })).toEqual([]);
    expect(problems('SliceRun', 'findMany', { where: { chartId: { equals: null } } })).toEqual([]);
  });

  it('rejects null on a list column', () => {
    expect(problems('LadderJob', 'findMany', { where: { skills: null } })).toHaveLength(1);
  });

  it('recurses through AND, OR and NOT into the same model', () => {
    const where = { OR: [{ chartId: null }, { AND: [{ accuracy: { not: null } }] }], NOT: { bogus: 1 } };
    const out = problems('SliceRun', 'findMany', { where });
    expect(out).toHaveLength(2);
    expect(out.join('\n')).toContain('where.OR[1].AND[0].accuracy.not');
    expect(out.join('\n')).toContain('where.NOT.bogus');
  });

  it('recurses through a to-one relation filter, directly and through is / isNot', () => {
    expect(problems('SliceRun', 'findMany', { where: { chart: { rating: { not: null } } } })).toEqual([]);
    expect(problems('SliceRun', 'findMany', { where: { chart: { is: { rating: { not: null } } } } })).toEqual([]);
    expect(problems('SliceRun', 'findMany', { where: { chart: { is: null } } })).toEqual([]);
    expect(problems('SliceRun', 'findMany', { where: { chart: { nope: 1 } } })).toHaveLength(1);
    expect(problems('SliceRun', 'findMany', { where: { chart: { isNot: { nope: 1 } } } })).toHaveLength(1);
  });

  it('recurses through some, every and none, and refuses a bare filter on a list relation', () => {
    const none = { where: { applications: { none: { userId: 'u' } } } };
    expect(problems('LadderJob', 'findMany', none)).toEqual([]);
    expect(problems('LadderJob', 'findMany', { where: { applications: { some: { nope: 1 } } } })).toHaveLength(1);
    expect(problems('LadderJob', 'findMany', { where: { applications: { userId: 'u' } } })).toHaveLength(1);
  });

  it('refuses null on a relation that is not optional', () => {
    expect(problems('SliceRun', 'findMany', { where: { user: null } })).toHaveLength(1);
    expect(problems('SliceRun', 'findMany', { where: { chart: null } })).toEqual([]);
  });

  it('accepts a compound unique key and checks the fields inside it', () => {
    expect(
      problems('UserBlock', 'findUnique', { where: { blockerId_blockedId: { blockerId: 'a', blockedId: 'b' } } }),
    ).toEqual([]);
    expect(
      problems('UserBlock', 'findUnique', { where: { blockerId_blockedId: { blockerId: 'a', nope: 'b' } } }),
    ).toHaveLength(1);
  });

  it('does not look inside a Date or a Json value', () => {
    expect(problems('SliceRun', 'findMany', { where: { createdAt: { gte: new Date() } } })).toEqual([]);
    expect(problems('SliceRun', 'findMany', { where: { modifiers: { equals: { a: 1 } } } })).toEqual([]);
  });
});

describe('orderBy', () => {
  it('rejects nulls ordering on a required column', () => {
    const [p] = problems('SliceRun', 'findMany', { orderBy: { accuracy: { sort: 'desc', nulls: 'last' } } });
    expect(p).toContain('orderBy.accuracy');
    expect(p).toContain('nulls');
    expect(p).toContain('required column');
  });

  it('accepts nulls ordering on an optional column', () => {
    expect(problems('SliceRun', 'findMany', { orderBy: { chartId: { sort: 'asc', nulls: 'last' } } })).toEqual([]);
  });

  it('checks every entry of a list, relation ordering and _count', () => {
    expect(
      problems('SliceRun', 'findMany', { orderBy: [{ chart: { rating: 'desc' } }, { accuracy: 'desc' }] }),
    ).toEqual([]);
    expect(problems('SliceRun', 'findMany', { orderBy: [{ accuracy: 'desc' }, { nope: 'asc' }] })).toHaveLength(1);
    expect(problems('SliceRun', 'findMany', { orderBy: { chart: { nope: 'asc' } } })).toHaveLength(1);
    expect(problems('LadderJob', 'findMany', { orderBy: { applications: { _count: 'desc' } } })).toEqual([]);
    expect(problems('LadderJob', 'findMany', { orderBy: { applications: 'desc' } })).toHaveLength(1);
  });
});

describe('select and include', () => {
  it('rejects the column LadderJob does not have, through a nested select', () => {
    const args = { select: { applications: { select: { job: { select: { updatedAt: true } } } } } };
    const out = problems('LadderUserPrefs', 'findMany', args);
    expect(out.join('\n')).toContain('no field "applications"');
    const direct = problems('LadderApplication', 'findMany', { select: { job: { select: { updatedAt: true } } } });
    expect(direct).toHaveLength(1);
    expect(direct[0]).toContain('select.job.select.updatedAt');
    expect(direct[0]).toContain('LadderJob has no field "updatedAt"');
  });

  it('accepts the column that exists', () => {
    expect(problems('LadderJob', 'findMany', { select: { lastSeenAt: true } })).toEqual([]);
    expect(problems('LadderJob', 'findMany', { select: { updatedAt: true } })).toHaveLength(1);
  });

  it('rejects select and include at one level, and a column named in include', () => {
    expect(problems('SliceRun', 'findMany', { select: { id: true }, include: { chart: true } })).toHaveLength(1);
    expect(
      problems('SliceRun', 'findMany', { include: { chart: { select: { id: true }, include: { runs: true } } } }),
    ).not.toEqual([]);
    expect(problems('SliceRun', 'findMany', { include: { accuracy: true } })).toHaveLength(1);
  });

  it('checks the arguments of a nested relation', () => {
    const ok = { include: { chart: { where: { rating: { not: null } }, select: { rating: true } } } };
    expect(problems('SliceRun', 'findMany', ok)).toEqual([]);
    const bad = { include: { chart: { where: { nope: 1 } } } };
    expect(problems('SliceRun', 'findMany', bad)).toHaveLength(1);
  });

  it('checks _count selections and count({ select })', () => {
    expect(problems('LadderJob', 'findMany', { select: { _count: { select: { applications: true } } } })).toEqual([]);
    expect(problems('LadderJob', 'findMany', { select: { _count: { select: { title: true } } } })).toHaveLength(1);
    expect(problems('LadderJob', 'count', { select: { _all: true, title: true } })).toEqual([]);
  });

  it('checks distinct and omit', () => {
    expect(problems('SliceRun', 'findMany', { distinct: ['chartId'] })).toEqual([]);
    expect(problems('SliceRun', 'findMany', { distinct: ['nope'] })).toHaveLength(1);
    expect(problems('SliceRun', 'findMany', { omit: { nope: true } })).toHaveLength(1);
  });
});

describe('data', () => {
  it('rejects a field the model does not have in create and update', () => {
    expect(problems('SliceRun', 'create', { data: { nope: 1 } })).toHaveLength(1);
    expect(problems('SliceRun', 'update', { where: { id: 1n }, data: { nope: 1 } })).toHaveLength(1);
    expect(problems('SliceRun', 'update', { where: { id: 1n }, data: { score: { increment: 1 } } })).toEqual([]);
  });

  it('checks both branches of upsert and every row of createMany', () => {
    const bad = { where: { id: 1n }, create: { nope: 1 }, update: { bogus: 2 } };
    expect(problems('SliceRun', 'upsert', bad)).toHaveLength(2);
    expect(problems('SliceRun', 'createMany', { data: [{ score: 1 }, { nope: 1 }] })).toHaveLength(1);
  });

  it('recurses into nested writes', () => {
    const ok = { data: { company: { connect: { id: 'c' } }, applications: { create: [{ userId: 'u' }] } } };
    expect(problems('LadderJob', 'update', { where: { id: 'j' }, ...ok })).toEqual([]);
    const bad = { where: { id: 'j' }, data: { applications: { create: { nope: 1 }, connect: { nope: 1 } } } };
    expect(problems('LadderJob', 'update', bad)).toHaveLength(2);
    expect(problems('LadderJob', 'update', { where: { id: 'j' }, data: { applications: { bogus: {} } } })).toHaveLength(
      1,
    );
  });

  it('rejects writing null to a required column', () => {
    expect(problems('SliceRun', 'update', { where: { id: 1n }, data: { accuracy: null } })).toHaveLength(1);
    expect(problems('SliceRun', 'update', { where: { id: 1n }, data: { chartId: null } })).toEqual([]);
  });
});

describe('operations, models and arguments', () => {
  it('reports an unknown model, an unknown operation and an unknown argument', () => {
    expect(problems('Nope', 'findMany', {})[0]).toContain('unknown model "Nope"');
    expect(problems('SliceRun', 'findAll', {})[0]).toContain('unknown operation "findAll"');
    expect(problems('SliceRun', 'findMany', { wher: {} })[0]).toContain('unknown argument "wher"');
  });

  it('takes the client accessor as well as the model name', () => {
    expect(problems('sliceRun', 'findMany', { where: { accuracy: { not: null } } })).toHaveLength(1);
    expect(problems('rMHark', 'findMany', {})).toEqual([]);
  });

  it('accepts undefined arguments for the operations that allow them', () => {
    expect(problems('SliceRun', 'findMany', undefined)).toEqual([]);
    expect(problems('SliceRun', 'count', undefined)).toEqual([]);
  });

  it('checks groupBy by, where, orderBy and aggregate columns', () => {
    const ok = { by: ['userId'], where: { chartId: { not: null } }, _count: { _all: true }, _max: { score: true } };
    expect(problems('SliceRun', 'groupBy', ok)).toEqual([]);
    expect(problems('SliceRun', 'groupBy', { by: ['nope'] })).toHaveLength(1);
    expect(problems('SliceRun', 'groupBy', { by: 'userId', orderBy: { _max: { nope: 'desc' } } })).toHaveLength(1);
    expect(problems('SliceRun', 'groupBy', { by: ['userId'], _sum: { nope: true } })).toHaveLength(1);
  });

  it('assertQueryShape throws with every problem', () => {
    expect(() => assertQueryShape('SliceRun', 'findMany', { where: { a: 1, b: 2 } })).toThrow(/a[\s\S]*b/);
    expect(() => assertQueryShape('SliceRun', 'findMany', { where: { userId: 'u' } })).not.toThrow();
  });
});

describe('shapeChecked', () => {
  const rows = async (_args?: unknown) => [];
  const fake = () => ({
    sliceRun: { findMany: rows, findFirst: rows },
    ladderJob: { findMany: rows },
    $queryRaw: async () => [{ anything: 1 }],
    $transaction: async (arg: unknown) => (typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(fake()) : arg),
  });

  it('throws before delegating for { not: null } on a required column', () => {
    const db = shapeChecked(fake());
    expect(() => db.sliceRun.findMany({ where: { accuracy: { not: null } } } as never)).toThrow(
      /SliceRun\.findMany[\s\S]*accuracy[\s\S]*required column/,
    );
  });

  it('throws for a select of a column the model lacks and passes for one it has', () => {
    const db = shapeChecked(fake());
    expect(() => db.ladderJob.findMany({ select: { updatedAt: true } } as never)).toThrow(/updatedAt/);
    expect(() => db.ladderJob.findMany({ select: { lastSeenAt: true } } as never)).not.toThrow();
  });

  it('delegates a valid query and returns the fake’s answer', async () => {
    const db = shapeChecked({ sliceRun: { findMany: async (_args?: unknown) => [{ id: 1 }] } });
    await expect(db.sliceRun.findMany({ where: { userId: 'u' } } as never)).resolves.toEqual([{ id: 1 }]);
  });

  it('checks inside $transaction(fn) and passes raw SQL through unchecked', async () => {
    const db = shapeChecked(fake());
    await expect(
      db.$transaction(async (tx: ReturnType<typeof fake>) =>
        tx.sliceRun.findMany({ where: { accuracy: { not: null } } } as never),
      ),
    ).rejects.toThrow(/accuracy/);
    await expect(db.$queryRaw()).resolves.toEqual([{ anything: 1 }]);
    await expect(db.$transaction([1] as never)).resolves.toEqual([1]);
  });

  it('keeps a vi.fn a spy through the wrapper', async () => {
    const findMany = vi.fn(async (_args?: unknown) => [{ id: 1 }]);
    const db = shapeChecked({ sliceRun: { findMany, findFirst: findMany } });
    db.sliceRun.findMany.mockResolvedValueOnce([{ id: 2 }]);
    await expect(db.sliceRun.findMany({ where: { userId: 'u' } })).resolves.toEqual([{ id: 2 }]);
    await expect(db.sliceRun.findMany()).resolves.toEqual([{ id: 1 }]);
    expect(db.sliceRun.findMany).toHaveBeenCalledWith({ where: { userId: 'u' } });
    expect(db.sliceRun.findMany.mock.calls).toHaveLength(2);
    expect(db.sliceRun.findMany).toBe(db.sliceRun.findMany);
    // The same function under a second operation is checked as that operation.
    expect(() => db.sliceRun.findFirst({ where: { nope: 1 } })).toThrow(/SliceRun\.findFirst/);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('keeps a mocked $transaction a spy and still checks its client', async () => {
    const inner = { sliceRun: { findMany: vi.fn(async (_args?: unknown) => []) } };
    const $transaction = vi.fn(async (fn: (tx: typeof inner) => unknown) => fn(inner));
    const db = shapeChecked({ $transaction });
    await expect(db.$transaction(async (tx) => tx.sliceRun.findMany({ where: { nope: 1 } }))).rejects.toThrow(/nope/);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls).toHaveLength(1);
  });

  it('passes a partial fake and the helpers a fake hangs on its client or a delegate', () => {
    const rowsByKey = new Map<string, unknown>();
    const reset = vi.fn();
    const db = shapeChecked({
      sliceRun: { findMany: rows, rows: [] as unknown[], reset },
      rowsByKey,
      reset,
      tables: { users: [] as unknown[] },
    });
    expect(db.rowsByKey).toBe(rowsByKey);
    expect(db.reset).toBe(reset);
    expect(db.tables.users).toEqual([]);
    expect(db.sliceRun.rows).toEqual([]);
    expect(() => db.sliceRun.reset).toThrow(/unknown operation "reset"/);
    // What test tooling reads off any object (`expect(...).toEqual`, pretty-format) is not an operation.
    expect(typeof db.sliceRun.constructor).toBe('function');
    expect(typeof db.sliceRun.toString).toBe('function');
    expect((db as Record<string, unknown>).ladderJob).toBeUndefined();
  });

  it('refuses an operation Prisma does not have and a model that does not exist', () => {
    const db = shapeChecked({ sliceRun: { findAll: rows }, notAModel: { findMany: rows } });
    expect(() => db.sliceRun.findAll()).toThrow(/unknown operation/);
    expect(() => db.notAModel).toThrow(/unknown model "notAModel"/);
  });
});

describe('assertJsonSafe', () => {
  it('throws on a BigInt with the path to it', () => {
    expect(() => assertJsonSafe({ proceeds: 5n })).toThrow(/proceeds/);
    expect(() => assertJsonSafe({ rows: [{ a: 1 }, { amount: 5n }] })).toThrow(/rows\[1\]\.amount/);
  });

  it('throws on a function, a Symbol, a non-finite number and a cycle', () => {
    expect(() => assertJsonSafe({ f: () => 1 })).toThrow(/f: a function/);
    expect(() => assertJsonSafe({ s: Symbol('x') })).toThrow(/s: a Symbol/);
    expect(() => assertJsonSafe({ n: NaN })).toThrow(/n: NaN/);
    expect(() => assertJsonSafe([Infinity])).toThrow(/\[0\]/);
    const loop: Record<string, unknown> = { name: 'x' };
    loop.self = loop;
    expect(() => assertJsonSafe(loop)).toThrow(/self: a circular reference/);
  });

  it('names the root when the value itself is bad', () => {
    expect(() => assertJsonSafe(5n)).toThrow(/\(root\)/);
  });

  it('accepts what JSON.stringify serialises faithfully', () => {
    const shared = { a: 1 };
    expect(() =>
      assertJsonSafe({
        s: 'x',
        n: 1.5,
        b: true,
        nil: null,
        gone: undefined,
        when: new Date(),
        list: [shared, shared],
      }),
    ).not.toThrow();
  });
});

describe('test-time only', () => {
  const PRODUCT_DIRS = ['app', 'components', 'features', 'lib', 'server', 'hooks', 'stores'];

  function* walk(dir: string): Generator<string> {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) yield* walk(full);
      else if (/\.(ts|tsx|mts)$/.test(name)) yield full;
    }
  }

  it('is imported by no product code', () => {
    const offenders: string[] = [];
    for (const d of PRODUCT_DIRS) {
      for (const file of walk(join(ROOT, d))) {
        const rel = relative(ROOT, file);
        if (/\.(test|product\.test)\.tsx?$/.test(rel) || rel === 'lib/db/query-shape.ts') continue;
        // Test-support files (a fake database) sit beside their tests under __tests__, which the walk skips.
        const code = readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '');
        if (/from\s+['"][^'"]*query-shape['"]|import\(\s*['"][^'"]*query-shape['"]\s*\)/.test(code))
          offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});

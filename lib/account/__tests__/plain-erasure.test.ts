import { describe, expect, it, vi } from 'vitest';

/**
 * Sprint 14 18: the operations that erase the models holding a member's id in a plain column. Each statement is
 * recorded (a Proxy stub, as `study-erasure.test.ts`), checked against the schema (`queryShapeProblems`: a required
 * column is never compared with or set to `null`, every field exists) and held to the member's own rows.
 */

interface Op {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; data?: Record<string, unknown> };
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@features/medschools/api/share-sync.server', () => ({
  eraseSharedMedEvents: vi.fn(async () => ({ events: 0 })),
}));

import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { anonymizeAccount } from '@/lib/account/deletion.server';
import { plainColumnErasureOps } from '@/lib/account/erasure-plain.server';
import { PLAIN_MEMBER_COLUMNS } from '@/lib/account/erasure-registry';
import { queryShapeProblems, schemaModels } from '@/lib/db/query-shape';

const ME = 'user-1';

/** The model name for a client accessor (`rMHboxMatch` is `RMHboxMatch`). */
const modelOf = (accessor: string) =>
  [...schemaModels().keys()].find((n) => n.charAt(0).toLowerCase() + n.slice(1) === accessor)!;

const own = () => plainColumnErasureOps(ME) as unknown as Op[];
const forModel = (ops: Op[], accessor: string) => ops.filter((o) => o.model === accessor);

async function recordAnonymize(userId: string): Promise<Op[]> {
  const fn = prismaMock.$transaction as ReturnType<typeof vi.fn>;
  fn.mockClear();
  await anonymizeAccount(userId);
  return fn.mock.calls[0]![0] as Op[];
}

describe('plainColumnErasureOps', () => {
  it('de-identifies a security report and keeps its text, status and notes', () => {
    const [op] = forModel(own(), 'securityReport');
    expect(op).toEqual({
      model: 'securityReport',
      method: 'updateMany',
      args: { where: { userId: ME }, data: { userId: null, reporterName: null, reporterEmail: null, ipHash: null } },
    });
    // Nothing of the report itself is written.
    for (const kept of ['title', 'category', 'severity', 'affectedArea', 'description', 'status', 'adminNotes'])
      expect(op!.args.data).not.toHaveProperty(kept);
  });

  it('deletes the member’s chat removals', () => {
    expect(forModel(own(), 'chatRemoval')).toEqual([
      { model: 'chatRemoval', method: 'deleteMany', args: { where: { userId: ME } } },
    ]);
  });

  it('nulls the first reporter of a Doctrine incident and the winner of an RMHBox and an RMHType match', () => {
    expect(forModel(own(), 'doctrineIncident')[0]!.args).toEqual({
      where: { firstReporterId: ME },
      data: { firstReporterId: null },
    });
    expect(forModel(own(), 'rMHboxMatch')[0]!.args).toEqual({
      where: { winnerUserId: ME },
      data: { winnerUserId: null },
    });
    expect(forModel(own(), 'rmhTypeMatch')[0]!.args).toEqual({
      where: { winnerUserId: ME },
      data: { winnerUserId: null },
    });
  });

  it('gives a required author column the deleted-user id and nulls an optional one', () => {
    const required: Array<[string, string]> = [
      ['communityChallenge', 'createdById'],
      ['communityCensus', 'createdById'],
      ['modMacro', 'createdById'],
      ['communityGoal', 'createdById'],
      ['canvasEvent', 'createdById'],
      ['studioChallenge', 'createdById'],
      ['linkDomainRule', 'addedById'],
    ];
    for (const [accessor, column] of required) {
      expect(forModel(own(), accessor), accessor).toEqual([
        {
          model: accessor,
          method: 'updateMany',
          args: { where: { [column]: ME }, data: { [column]: DELETED_USER_ID } },
        },
      ]);
    }
    const optional: Array<[string, string]> = [
      ['targetedNotice', 'createdById'],
      ['ladderReviewTask', 'resolvedById'],
      ['botWorkerSettings', 'updatedById'],
    ];
    for (const [accessor, column] of optional) {
      expect(forModel(own(), accessor), accessor).toEqual([
        { model: accessor, method: 'updateMany', args: { where: { [column]: ME }, data: { [column]: null } } },
      ]);
    }
  });

  it('writes a member column only as null where the schema allows it, else as the deleted-user id', () => {
    const models = schemaModels();
    for (const op of own()) {
      const info = models.get(modelOf(op.model))!;
      for (const [column, value] of Object.entries(op.args.data ?? {})) {
        const f = info.fields.get(column)!;
        expect(value, `${op.model}.${column}`).toBe(f.optional ? null : DELETED_USER_ID);
      }
    }
  });

  it('is valid against the schema: every field exists and no required column is compared with or set to null', () => {
    for (const op of own()) {
      expect(queryShapeProblems(op.model, op.method, op.args), `${op.model}.${op.method}`).toEqual([]);
    }
  });

  it('matches no other member’s row: one condition, on the member’s own column, on every statement', () => {
    for (const op of own()) {
      expect(['updateMany', 'deleteMany'], `${op.model}.${op.method}`).toContain(op.method);
      const where = op.args.where ?? {};
      expect(Object.keys(where), `${op.model} where`).toHaveLength(1);
      expect(Object.values(where), `${op.model} where value`).toEqual([ME]);
      // The column filtered on is one the registry names for that model.
      const entry = PLAIN_MEMBER_COLUMNS[modelOf(op.model)];
      expect(entry, `${op.model} is not in PLAIN_MEMBER_COLUMNS`).toBeDefined();
      expect(entry!.columns, `${op.model} where column`).toContain(Object.keys(where)[0]);
    }
  });

  it('writes the member’s id nowhere (a second member passes through untouched)', () => {
    const other = plainColumnErasureOps('user-2') as unknown as Op[];
    expect(JSON.stringify(other)).not.toContain(ME);
    expect(JSON.stringify(own())).not.toContain('user-2');
    // The data is the same whoever the member is: only the filter changes.
    expect(other.map((o) => [o.model, o.method, o.args.data])).toEqual(
      own().map((o) => [o.model, o.method, o.args.data]),
    );
  });

  it('deletes only chat removals; everything else is an update', () => {
    const deleting = own().filter((o) => o.method === 'deleteMany');
    expect(deleting.map((o) => o.model)).toEqual(['chatRemoval']);
  });

  it('writes only models classified erase or deidentify', () => {
    const written = new Set(own().map((o) => modelOf(o.model)));
    for (const name of written) {
      const decision = PLAIN_MEMBER_COLUMNS[name]!.decision;
      expect(['erase', 'deidentify'], `${name} is '${decision}' but plainColumnErasureOps writes it`).toContain(
        decision,
      );
    }
  });
});

describe('anonymizeAccount (plain member columns)', () => {
  it('carries out every operation of plainColumnErasureOps, inside the one transaction', async () => {
    const tx = await recordAnonymize(ME);
    for (const op of own()) {
      expect(tx, `${op.model}.${op.method}`).toContainEqual(op);
    }
  });

  it('names the erased member and no other in the operations it adds', async () => {
    const tx = await recordAnonymize('user-9');
    const added = tx.filter((o) => PLAIN_MEMBER_COLUMNS[modelOf(o.model)] && o.model !== 'followEvent');
    expect(added.length).toBeGreaterThan(0);
    for (const o of added) expect(JSON.stringify(o.args.where)).not.toContain('user-1');
  });
});

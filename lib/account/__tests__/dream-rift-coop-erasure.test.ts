import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

/**
 * Account deletion anonymises the user row in place, so a co-op run never cascades. `anonymizeAccount` must take the
 * member's id out of `memberIds` and make their slot's name "Deleted user" in every run they are in: rows the hub wrote
 * (names resolved live, the id in `memberIds`) and rows from before the feature (a stored account object, found by
 * `players` `array_contains`). Reads before the transaction are guarded for the recording stubs, the raw SQL runs inside
 * the transaction (so a failed transaction leaves the rows for the retry) and names the real table and quoted camelCase
 * column, and other members' slots are left alone.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

interface RunRow {
  id: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  memberIds: string[];
  players: unknown;
}

const h = vi.hoisted(() => ({
  runs: [] as RunRow[],
  findManyArgs: [] as unknown[],
  raw: [] as Array<{ sql: string; values: unknown[] }>,
}));

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => {
          if (name === 'dreamRiftCoopRun' && method === 'findMany') {
            h.findManyArgs.push(args);
            return Promise.resolve(h.runs);
          }
          return { model: name, method, args };
        },
      },
    );
  const raw = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const stmt = { sql: strings.join('?'), values };
    h.raw.push(stmt);
    return stmt;
  };
  return new Proxy(
    { $transaction: vi.fn(async (ops: unknown[]) => ops), $executeRaw: raw } as Record<string, unknown>,
    {
      get: (t, key: string) => (key in t ? t[key] : model(key)),
    },
  );
});
vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked(prismaMock),
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';

const DELETED = 'deleted-user';

const newRun = (over: Partial<RunRow> & { id: string }): RunRow => ({
  startedAt: new Date('2027-01-10T10:00:00Z'),
  finishedAt: new Date('2027-01-10T10:20:00Z'),
  memberIds: ['u1', 'u2', '', ''],
  players: [
    { slot: 0, name: '', charId: 'bllm', score: 70 },
    { slot: 1, name: '', charId: 'mls', score: 50 },
    { slot: 2, name: 'Typed Guest', charId: 'qln', score: 20 },
  ],
  ...over,
});

const legacyRun = (over: Partial<RunRow> & { id: string }): RunRow => ({
  startedAt: null,
  finishedAt: null,
  memberIds: [],
  players: [
    {
      name: 'Leaving Typed',
      charId: 'bllm',
      score: 9,
      account: { id: 'u1', handle: 'leaving-handle', name: 'Leaving Real Name', image: 'https://img.test/leaving.png' },
    },
    {
      name: 'Other Typed',
      charId: 'mls',
      score: 8,
      account: { id: 'u2', handle: 'other-handle', name: 'Other Real Name', image: null },
    },
    { name: 'Guest Typed', charId: 'qln', score: 7, account: null },
  ],
  ...over,
});

async function erase(): Promise<Op[]> {
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
  await anonymizeAccount('u1');
  return (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
}

/** The players rewrites: `updateMany` by run id (the board erasure's host null is by `hostUserId`). */
const updatesFor = (tx: Op[]) =>
  tx.filter(
    (o) =>
      o.model === 'dreamRiftCoopRun' &&
      o.method === 'updateMany' &&
      typeof (o.args as { where?: { id?: unknown } }).where?.id === 'string',
  );
const coopRaw = () => h.raw.filter((r) => r.sql.includes('"DreamRiftCoopRun"'));

beforeEach(() => {
  h.runs = [];
  h.findManyArgs.length = 0;
  h.raw.length = 0;
});

describe('anonymizeAccount (Dream Rift co-op runs)', () => {
  it('finds the member in new rows by memberIds and in old rows by the stored account object', async () => {
    await erase();
    expect(h.findManyArgs).toHaveLength(1);
    expect(h.findManyArgs[0]).toMatchObject({
      where: {
        OR: [{ memberIds: { has: 'u1' } }, { players: { array_contains: [{ account: { id: 'u1' } }] } }],
      },
    });
  });

  it("takes the member's id out of memberIds in one statement against the real table and column", async () => {
    h.runs = [newRun({ id: 'r1' })];
    const tx = await erase();
    const [stmt] = coopRaw();
    // Inside the transaction, not before it: a failed transaction must leave memberIds for the retry to match again.
    expect(tx).toContain(stmt);
    expect(stmt, 'a raw statement for DreamRiftCoopRun').toBeDefined();
    expect(stmt!.sql).toContain('UPDATE "DreamRiftCoopRun" SET "memberIds" = array_replace("memberIds"');
    expect(stmt!.sql).toContain('WHERE "memberIds" @>');
    expect(stmt!.values).toEqual(['u1', DELETED, 'u1']);
  });

  it('names the table and column the schema really has (the model has no @@map)', () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'DreamRiftCoopRun')!;
    expect(model.dbName).toBeNull();
    expect(model.fields.some((f) => f.name === 'memberIds' && f.kind === 'scalar')).toBe(true);
    // The runtime model carries no list flag, so the schema source says it is an array.
    const source = readFileSync(join(__dirname, '..', '..', '..', 'prisma', 'schema', 'games.prisma'), 'utf8');
    const block = source.match(/model DreamRiftCoopRun \{[\s\S]*?\n\}/)![0];
    expect(block).toMatch(/\n\s+memberIds\s+String\[\]/);
    expect(block).not.toContain('@@map');
    expect(model.fields.some((f) => f.name === 'startedAt')).toBe(true);
    expect(model.fields.some((f) => f.name === 'finishedAt')).toBe(true);
  });

  it('scrubs a new row: their slot reads "Deleted user", every other slot is untouched', async () => {
    h.runs = [newRun({ id: 'r1' })];
    const tx = await erase();
    const [update] = updatesFor(tx);
    expect(update).toBeDefined();
    const args = update!.args as { where: { id: string }; data: { players: Array<Record<string, unknown>> } };
    assertJsonSafe(args);
    expect(args.where).toEqual({ id: 'r1' });
    expect(args.data.players).toEqual([
      { slot: 0, name: 'Deleted user', charId: 'bllm', score: 70 },
      { slot: 1, name: '', charId: 'mls', score: 50 },
      { slot: 2, name: 'Typed Guest', charId: 'qln', score: 20 },
    ]);
  });

  it('scrubs an old row: no handle, name or avatar of theirs stays, and the other player keeps theirs', async () => {
    h.runs = [legacyRun({ id: 'old1', finishedAt: null })];
    const tx = await erase();
    const [update] = updatesFor(tx);
    const players = (update!.args as { data: { players: Array<Record<string, unknown>> } }).data.players;
    expect(players[0]).toMatchObject({ name: 'Deleted user', account: { id: DELETED } });
    const text = JSON.stringify(players[0]);
    for (const gone of ['Leaving Typed', 'Leaving Real Name', 'leaving-handle', 'leaving.png', '"u1"']) {
      expect(text).not.toContain(gone);
    }
    expect(players[1]).toMatchObject({ name: 'Other Typed', account: { id: 'u2', handle: 'other-handle' } });
    expect(players[2]).toMatchObject({ name: 'Guest Typed' });
  });

  it('leaves a started and unfinished run to the memberIds statement: its players are not rewritten', async () => {
    h.runs = [newRun({ id: 'open', finishedAt: null, players: [] })];
    const tx = await erase();
    expect(updatesFor(tx)).toHaveLength(0);
    expect(coopRaw()).toHaveLength(1);
  });

  it('rewrites each run once and leaves rows the member is not in alone', async () => {
    h.runs = [newRun({ id: 'a' }), legacyRun({ id: 'b' }), newRun({ id: 'c', memberIds: ['x', 'y', '', ''] })];
    const tx = await erase();
    const ids = updatesFor(tx).map((o) => (o.args as { where: { id: string } }).where.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('keeps the erasure going when the stub answers a read with something that is not rows', async () => {
    // The recording stubs of other erasure tests answer every read with an operation object.
    h.runs = { model: 'dreamRiftCoopRun', method: 'findMany' } as unknown as RunRow[];
    await expect(erase()).resolves.toBeDefined();
  });

  it('still nulls the host (the board erasure) beside the new operations', async () => {
    h.runs = [newRun({ id: 'r1' })];
    const tx = await erase();
    const host = tx.find(
      (o) =>
        o.model === 'dreamRiftCoopRun' && o.method === 'updateMany' && JSON.stringify(o.args).includes('hostUserId'),
    );
    expect(host?.args).toEqual({ where: { hostUserId: 'u1' }, data: { hostUserId: null } });
  });
});

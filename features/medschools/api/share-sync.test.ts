import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dedupeHash } from '../engine/dedupe';
import { createFakePrisma, type FakePrismaOptions } from '../scrape/test-support';
import {
  AccountTooNewError,
  SharingUnavailableError,
  accountOldEnoughToShare,
  auditRmh,
  deleteSharedEvents,
  eraseSharedMedEvents,
  milestoneIdsOf,
  reconcileShared,
  rollupRmhCells,
  shareSecret,
  upsertCycleRow,
  withShared,
  withSharedErase,
} from './share-sync.server';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

const SECRET = 'unit-test-secret-0123456789';
const OLD = new Date('2026-01-01T00:00:00.000Z');
const NOW = new Date('2026-11-20T12:00:00.000Z');
const DAY = new Date('2026-11-20T00:00:00.000Z');
const DAY2 = new Date('2026-11-25T00:00:00.000Z');

type Row = Record<string, unknown>;
type World = ReturnType<typeof world>;

function world(opts?: FakePrismaOptions) {
  const f = createFakePrisma(opts);
  for (const id of ['s1', 's2', 's3']) f.tables.medSchool.push({ id, slug: id, degree: 'MD', active: true });
  return { ...f, db: f.prisma as unknown as PrismaClient };
}

const rows = (w: World, t: string): Row[] => w.tables[t] as Row[];
const events = (w: World) => rows(w, 'medCycleEvent').filter((e) => e.source === 'RMH');
/** RMH count rows with at least one event. A cell whose last event went keeps a 0 row until the daily snapshot (`zeroRows`). */
const rmhCounts = (w: World) => rows(w, 'medCycleCount').filter((c) => c.source === 'RMH' && (c.count as number) > 0);
const zeroRows = (w: World) => rows(w, 'medCycleCount').filter((c) => c.source === 'RMH' && c.count === 0);
const hash = (milestoneId: string) => dedupeHash(SECRET, 'RMH', `milestone:${milestoneId}`);

const addUser = (w: World, id: string, createdAt = OLD) => w.tables.user.push({ id, createdAt });

async function addCycle(
  w: World,
  userId: string,
  cycleYear = 2027,
  share = false,
  id = `cycle-${userId}-${cycleYear}`,
) {
  await withShared(
    userId,
    { cycleYear },
    (tx) => tx.medTrackerCycle.create({ data: { id, userId, cycleYear, shareAnonymously: share, everShared: share } }),
    w.db,
    NOW,
  );
  return id;
}

async function addApp(
  w: World,
  userId: string,
  a: { id: string; cycleId: string; schoolId: string; program?: 'REG' | 'PHD' },
) {
  await withShared(userId, {}, (tx) => tx.medTrackerApplication.create({ data: { program: 'REG', ...a } }), w.db, NOW);
}

async function addMs(
  w: World,
  userId: string,
  m: {
    id: string;
    applicationId: string;
    type: 'INTERVIEW' | 'SECONDARY' | 'SECONDARY_SUBMITTED' | 'COMPLETE' | 'SUBMITTED' | 'HOLD' | 'ACCEPTANCE';
    date?: Date;
  },
) {
  await withShared(
    userId,
    {},
    (tx) =>
      tx.medTrackerMilestone.upsert({
        where: { applicationId_type: { applicationId: m.applicationId, type: m.type } },
        create: { id: m.id, applicationId: m.applicationId, type: m.type, date: m.date ?? DAY },
        update: { date: m.date ?? DAY },
      }),
    w.db,
    NOW,
  );
}

const setShare = (w: World, userId: string, cycleYear: number, on: boolean) =>
  withShared(
    userId,
    { cycleYear },
    (tx) =>
      tx.medTrackerCycle.update({
        where: { userId_cycleYear: { userId, cycleYear } },
        // The real writer (`upsertCycleRow`) sets `everShared` the first time sharing is on and never clears it.
        data: { shareAnonymously: on, ...(on ? { everShared: true } : {}) },
      }),
    w.db,
    NOW,
  );

/** One user, one cycle, one application at `schoolId`, one milestone. Returns the ids. */
async function simple(
  w: World,
  u: string,
  o: {
    type?: 'INTERVIEW' | 'SECONDARY' | 'SECONDARY_SUBMITTED' | 'COMPLETE' | 'SUBMITTED';
    schoolId?: string;
    share?: boolean;
    date?: Date;
  } = {},
) {
  addUser(w, u);
  const cycleId = await addCycle(w, u, 2027, false);
  const applicationId = `app-${u}`;
  await addApp(w, u, { id: applicationId, cycleId, schoolId: o.schoolId ?? 's1' });
  const milestoneId = `ms-${u}`;
  await addMs(w, u, {
    id: milestoneId,
    applicationId,
    type: o.type ?? 'INTERVIEW',
    ...(o.date ? { date: o.date } : {}),
  });
  if (o.share ?? true) await setShare(w, u, 2027, true);
  return { cycleId, applicationId, milestoneId };
}

/** The invariant after every transaction (plan D5), computed independently of the module. */
function expectConsistent(w: World) {
  const cycles = new Map(rows(w, 'medTrackerCycle').map((c) => [c.id, c]));
  const apps = new Map(rows(w, 'medTrackerApplication').map((a) => [a.id, a]));
  const want = new Map<string, string>();
  for (const m of rows(w, 'medTrackerMilestone')) {
    const a = apps.get(m.applicationId);
    const c = a && cycles.get(a.cycleId);
    if (!a || !c || !c.shareAnonymously || m.type === 'COMPLETE' || m.type === 'SUBMITTED' || m.type === 'SECONDARY_SUBMITTED') continue;
    const day = (m.date as Date).toISOString().slice(0, 10);
    want.set(hash(m.id as string), `${a.schoolId}|${a.program}|${c.cycleYear}|${day}|${m.type}`);
  }
  const have = new Map(
    events(w).map((e) => [
      e.dedupeHash as string,
      `${e.schoolId}|${e.program}|${e.cycleYear}|${(e.occurredAt as Date).toISOString().slice(0, 10)}|${e.eventType}`,
    ]),
  );
  expect(have).toEqual(want);
  expect(events(w)).toHaveLength(want.size);
  const n = new Map<string, number>();
  for (const k of want.values()) n.set(k, (n.get(k) ?? 0) + 1);
  const counts = new Map(
    rmhCounts(w).map((c) => [
      `${c.schoolId}|${c.program}|${c.cycleYear}|${(c.date as Date).toISOString().slice(0, 10)}|${c.eventType}`,
      [c.count, c.contributors],
    ]),
  );
  expect(counts).toEqual(new Map([...n].map(([k, v]) => [k, [v, v]])));
}

beforeEach(() => {
  process.env.MEDSCHOOLS_DEDUPE_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
});

describe('a full tracker (transaction limits and bulk writes)', () => {
  it('every share-sync transaction gets an explicit timeout and maxWait, and new events go in one createMany', async () => {
    const w = world();
    addUser(w, 'u1');
    const cycleId = await addCycle(w, 'u1', 2027, false);
    for (let i = 0; i < 40; i++) {
      w.tables.medSchool.push({ id: `sx${i}`, slug: `sx${i}`, degree: 'MD', active: true });
      await addApp(w, 'u1', { id: `app${i}`, cycleId, schoolId: `sx${i}` });
      await addMs(w, 'u1', { id: `m${i}`, applicationId: `app${i}`, type: 'INTERVIEW', date: DAY });
    }
    const tx = vi.spyOn(w.db, '$transaction');
    const eventTable = w.prisma.medCycleEvent as unknown as {
      createMany: (a: unknown) => Promise<unknown>;
      create: (a: unknown) => Promise<unknown>;
    };
    const many = vi.spyOn(eventTable, 'createMany');
    const single = vi.spyOn(eventTable, 'create');
    await setShare(w, 'u1', 2027, true);
    expect(events(w)).toHaveLength(40);
    expect(many).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    for (const call of tx.mock.calls) expect(call[1]).toEqual({ timeout: 30_000, maxWait: 10_000 });
    expect(tx).toHaveBeenCalled();
    expectConsistent(w);
  });
});

describe('basic sharing', () => {
  it('sharing on writes one anonymous event and one count row; off deletes both', async () => {
    const w = world();
    const { milestoneId } = await simple(w, 'u1', { share: false });
    expect(events(w)).toHaveLength(0);
    await setShare(w, 'u1', 2027, true);
    expect(events(w)).toHaveLength(1);
    expect(events(w)[0]).toMatchObject({
      source: 'RMH',
      inState: null,
      schoolId: 's1',
      program: 'REG',
      cycleYear: 2027,
      eventType: 'INTERVIEW',
      occurredAt: DAY,
      dedupeHash: hash(milestoneId),
    });
    expect(rmhCounts(w)).toEqual([expect.objectContaining({ count: 1, contributors: 1, date: DAY, source: 'RMH' })]);
    await setShare(w, 'u1', 2027, false);
    expect(events(w)).toHaveLength(0);
    expect(rmhCounts(w)).toHaveLength(0);
    expect(zeroRows(w)).toHaveLength(1); // kept at 0 until the daily snapshot
    expectConsistent(w);
  });

  it('SUBMITTED, COMPLETE and SECONDARY_SUBMITTED never leave the private tables', async () => {
    const w = world();
    const { applicationId } = await simple(w, 'u1', { type: 'COMPLETE' });
    await addMs(w, 'u1', { id: 'ms-sub', applicationId, type: 'SUBMITTED' });
    await addMs(w, 'u1', { id: 'ms-sec-sub', applicationId, type: 'SECONDARY_SUBMITTED' });
    expect(events(w)).toHaveLength(0);
    expect(rmhCounts(w)).toHaveLength(0);
  });

  it('a milestone added to a shared cycle is shared at once', async () => {
    const w = world();
    const { applicationId } = await simple(w, 'u1');
    await addMs(w, 'u1', { id: 'ms-2', applicationId, type: 'SECONDARY' });
    expect(
      events(w)
        .map((e) => e.eventType)
        .sort(),
    ).toEqual(['INTERVIEW', 'SECONDARY']);
    expectConsistent(w);
  });
});

describe('what the written row identifies (D3)', () => {
  it('no stored column holds an id of the user, cycle, application or milestone', async () => {
    const w = world();
    const U = 'USERID-7f3a9c1e5b2d4488';
    const C = 'CYCLEID-90be11d2aa5c4e07';
    const A = 'APPID-c41d77e0b9a3428f';
    const M = 'MSID-5e0a8d36f1c24b19';
    addUser(w, U);
    await addCycle(w, U, 2027, false, C);
    await addApp(w, U, { id: A, cycleId: C, schoolId: 's1' });
    await addMs(w, U, { id: M, applicationId: A, type: 'INTERVIEW' });
    await setShare(w, U, 2027, true);

    expect(events(w)).toHaveLength(1);
    const dump = JSON.stringify(events(w));
    for (const id of [U, C, A, M]) expect(dump).not.toContain(id);
    const e = events(w)[0]!;
    expect(e.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(e.id).not.toMatch(/^c[a-z0-9]{24}$/);
    expect(e.ingestedAt).toEqual(e.occurredAt);
    expect(e.dedupeHash).toBe(hash(M));
    expect(Object.keys(e).sort()).toEqual(
      [
        'cycleYear',
        'dedupeHash',
        'eventType',
        'id',
        'ingestedAt',
        'inState',
        'occurredAt',
        'program',
        'schoolId',
        'source',
      ].sort(),
    );
    // The hash exists in exactly one table: nothing else joins the event to the milestone.
    for (const [name, t] of Object.entries(w.tables)) {
      if (name === 'medCycleEvent') continue;
      expect(JSON.stringify(t), name).not.toContain(e.dedupeHash as string);
    }
    expect(Object.keys(rows(w, 'medTrackerMilestone')[0]!).sort()).toEqual(['applicationId', 'date', 'id', 'type']);
  });

  it('ingestedAt is the milestone day, not the minute it was entered', async () => {
    const w = world();
    await simple(w, 'u1', { date: new Date('2026-10-05T00:00:00.000Z') });
    expect(events(w)[0]!.ingestedAt).toEqual(new Date('2026-10-05T00:00:00.000Z'));
  });
});

describe('the public snapshot columns (Q2)', () => {
  it('the writer never touches publishedCount or publishedContributors, through create, update and zeroing', async () => {
    const w = world();
    await simple(w, 'u1');
    await simple(w, 'u2');
    const row = () => rows(w, 'medCycleCount').find((c) => c.source === 'RMH')!;
    expect(row().publishedCount ?? null).toBeNull();
    expect(row().publishedContributors ?? null).toBeNull();
    row().publishedCount = 7; // what the daily job would have written
    row().publishedContributors = 7;
    await setShare(w, 'u1', 2027, false);
    await setShare(w, 'u2', 2027, false);
    expect(row()).toMatchObject({ count: 0, contributors: 0, publishedCount: 7, publishedContributors: 7 });
  });

  it('count rows get a random UUID, not the cuid default that embeds the creation minute', async () => {
    const w = world();
    await simple(w, 'u1');
    const id = rmhCounts(w)[0]!.id as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('contributors and the k floor (Review Focus 3)', () => {
  it('count and contributors follow the events, and another source is never touched', async () => {
    const w = world();
    const others = [
      {
        id: 'ct',
        schoolId: 's1',
        program: 'REG',
        cycleYear: 2027,
        date: DAY,
        eventType: 'INTERVIEW',
        source: 'CYCLETRACK',
        count: 50,
        contributors: null,
      },
      {
        id: 'ad',
        schoolId: 's1',
        program: 'REG',
        cycleYear: 2027,
        date: DAY,
        eventType: 'INTERVIEW',
        source: 'ADMIT',
        count: 7,
        contributors: 7,
      },
    ];
    for (const o of others) w.tables.medCycleCount.push({ ...o });
    const ids: string[] = [];
    for (const u of ['u1', 'u2', 'u3']) ids.push((await simple(w, u)).milestoneId);
    const cell = () => rmhCounts(w).map((c) => [c.count, c.contributors]);
    expect(cell()).toEqual([[3, 3]]);
    const untouched = () => rows(w, 'medCycleCount').filter((c) => c.source !== 'RMH');
    expect(untouched()).toEqual(others);

    await withSharedErase('u1', {}, (tx) => tx.medTrackerMilestone.delete({ where: { id: ids[0] } }), w.db, NOW);
    expect(cell()).toEqual([[2, 2]]); // the row stays; hiding below 3 is the reader's job
    expect(untouched()).toEqual(others);
    await withSharedErase('u2', {}, (tx) => tx.medTrackerMilestone.delete({ where: { id: ids[1] } }), w.db, NOW);
    await withSharedErase('u3', {}, (tx) => tx.medTrackerMilestone.delete({ where: { id: ids[2] } }), w.db, NOW);
    expect(rmhCounts(w)).toHaveLength(0); // no zero rows
    expect(untouched()).toEqual(others);
    expectConsistent(w);
  });

  it('3 -> 4 -> 3 keeps the row at the right counts', async () => {
    const w = world();
    for (const u of ['u1', 'u2', 'u3', 'u4']) await simple(w, u);
    expect(rmhCounts(w).map((c) => c.count)).toEqual([4]);
    await setShare(w, 'u4', 2027, false);
    expect(rmhCounts(w).map((c) => [c.count, c.contributors])).toEqual([[3, 3]]);
  });

  it('rollupRmhCells reports created, updated and deleted', async () => {
    const w = world();
    await simple(w, 'u1');
    const cell = `s1|REG|2027|2026-11-20|INTERVIEW`;
    const r = await w.db.$transaction((tx) => rollupRmhCells(tx, [cell]));
    expect(r).toEqual({ created: 0, updated: 0, deleted: 0 });
    rows(w, 'medCycleCount').find((c) => c.source === 'RMH')!.count = 9;
    expect(await w.db.$transaction((tx) => rollupRmhCells(tx, [cell]))).toEqual({ created: 0, updated: 1, deleted: 0 });
    w.tables.medCycleCount.length = 0;
    expect(await w.db.$transaction((tx) => rollupRmhCells(tx, [cell]))).toEqual({ created: 1, updated: 0, deleted: 0 });
    w.tables.medCycleEvent.length = 0;
    // The last event goes: the row stays, at 0 (the daily snapshot removes it), so the cell never vanishes mid-day.
    expect(await w.db.$transaction((tx) => rollupRmhCells(tx, [cell]))).toEqual({ created: 0, updated: 1, deleted: 0 });
    expect(zeroRows(w)).toEqual([expect.objectContaining({ count: 0, contributors: 0 })]);
    // A cell that never had a row and has no events gets none.
    w.tables.medCycleCount.length = 0;
    expect(await w.db.$transaction((tx) => rollupRmhCells(tx, [cell]))).toEqual({ created: 0, updated: 0, deleted: 0 });
    expect(rows(w, 'medCycleCount')).toHaveLength(0);
  });
});

describe('a milestone edited after sharing (Review Focus 2)', () => {
  it('a date change moves the event between two cells, both re-rolled', async () => {
    const w = world();
    const a = await simple(w, 'u1');
    await simple(w, 'u2');
    expect(rmhCounts(w).map((c) => c.count)).toEqual([2]);
    await withShared(
      'u1',
      {},
      (tx) => tx.medTrackerMilestone.update({ where: { id: a.milestoneId }, data: { date: DAY2 } }),
      w.db,
      NOW,
    );
    const byDay = Object.fromEntries(rmhCounts(w).map((c) => [(c.date as Date).toISOString().slice(0, 10), c.count]));
    expect(byDay).toEqual({ '2026-11-20': 1, '2026-11-25': 1 });
    expectConsistent(w);
  });

  it('a type change to COMPLETE deletes the event; back to SECONDARY recreates it with the same hash and a new id', async () => {
    const w = world();
    const a = await simple(w, 'u1');
    const first = events(w)[0]!;
    const set = (type: 'COMPLETE' | 'SECONDARY') =>
      withShared(
        'u1',
        {},
        (tx) => tx.medTrackerMilestone.update({ where: { id: a.milestoneId }, data: { type } }),
        w.db,
        NOW,
      );
    await set('COMPLETE');
    expect(events(w)).toHaveLength(0);
    expect(rmhCounts(w)).toHaveLength(0);
    await set('SECONDARY');
    const again = events(w)[0]!;
    expect(again.dedupeHash).toBe(first.dedupeHash);
    expect(again.id).not.toBe(first.id);
    expect(again.eventType).toBe('SECONDARY');
    expectConsistent(w);
  });
});

describe('toggling and two tabs (Review Focus 1)', () => {
  function prng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it('on, off, on in sequence ends with the events of the final flag', async () => {
    const w = world();
    await simple(w, 'u1', { share: false });
    for (const on of [true, false, true]) {
      await setShare(w, 'u1', 2027, on);
      expectConsistent(w);
    }
    expect(events(w)).toHaveLength(1);
  });

  it.each(Array.from({ length: 30 }, (_, i) => i + 1))(
    'seed %i: concurrent toggles and writes converge',
    async (seed) => {
      const rand = prng(seed);
      const jitter = async () => {
        const n = Math.floor(rand() * 4);
        for (let i = 0; i < n; i++) await (rand() < 0.5 ? Promise.resolve() : new Promise((r) => setImmediate(r)));
      };
      const w = world({ jitter });
      const a = await simple(w, 'u1', { share: false });
      await addApp(w, 'u1', { id: 'app-u1-b', cycleId: a.cycleId, schoolId: 's2', program: 'PHD' });
      await addMs(w, 'u1', { id: 'ms-u1-b', applicationId: 'app-u1-b', type: 'SECONDARY' });
      await simple(w, 'u2'); // another user in the same school cell
      const tasks = [
        setShare(w, 'u1', 2027, true),
        addMs(w, 'u1', { id: 'ms-u1-c', applicationId: a.applicationId, type: 'ACCEPTANCE' }),
        setShare(w, 'u1', 2027, false),
        setShare(w, 'u1', 2027, true),
        addMs(w, 'u1', { id: 'ms-u1-d', applicationId: 'app-u1-b', type: 'HOLD' }),
        setShare(w, 'u2', 2027, false),
        setShare(w, 'u2', 2027, true),
      ].sort(() => rand() - 0.5);
      await Promise.all(tasks);
      expectConsistent(w);
      expect(await auditRmh(w.db)).toEqual({ orphanEvents: 0, mismatchedCells: 0, missingEvents: 0 });
    },
  );
});

describe('every delete path (Review Focus 4)', () => {
  async function shared(w: World) {
    const a = await simple(w, 'u1');
    await addMs(w, 'u1', { id: 'ms-u1-2', applicationId: a.applicationId, type: 'SECONDARY' });
    await simple(w, 'u2'); // a bystander in the same cell
    return a;
  }

  it('a milestone', async () => {
    const w = world();
    const a = await shared(w);
    await withSharedErase(
      'u1',
      { applicationId: a.applicationId, milestoneType: 'INTERVIEW' },
      (tx) => tx.medTrackerMilestone.delete({ where: { id: a.milestoneId } }),
      w.db,
      NOW,
    );
    expect(events(w).map((e) => e.dedupeHash)).not.toContain(hash(a.milestoneId));
    expect(events(w)).toHaveLength(2);
    expectConsistent(w);
  });

  it('an application, by the database cascade', async () => {
    const w = world();
    const a = await shared(w);
    await withSharedErase(
      'u1',
      { applicationId: a.applicationId },
      (tx) => tx.medTrackerApplication.delete({ where: { id: a.applicationId } }),
      w.db,
      NOW,
    );
    expect(events(w)).toHaveLength(1);
    expect(rows(w, 'medTrackerMilestone').map((m) => m.id)).toEqual(['ms-u2']);
    expectConsistent(w);
  });

  it('a cycle, by the database cascade', async () => {
    const w = world();
    const a = await shared(w);
    await withSharedErase(
      'u1',
      { cycleYear: 2027 },
      (tx) => tx.medTrackerCycle.delete({ where: { id: a.cycleId } }),
      w.db,
      NOW,
    );
    expect(events(w)).toHaveLength(1);
    expectConsistent(w);
  });

  it('reads the milestone ids before the rows are deleted', async () => {
    const w = world();
    const a = await shared(w);
    let seen: { events: number; ids: string[] } | undefined;
    await withSharedErase(
      'u1',
      { cycleYear: 2027 },
      async (tx) => {
        seen = { events: events(w).length, ids: await milestoneIdsOf(tx, 'u1', { cycleYear: 2027 }) };
        await tx.medTrackerCycle.delete({ where: { id: a.cycleId } });
        expect(await milestoneIdsOf(tx, 'u1', { cycleYear: 2027 })).toEqual([]);
      },
      w.db,
      NOW,
    );
    expect(seen?.events).toBe(3);
    expect(seen?.ids.sort()).toEqual(['ms-u1', 'ms-u1-2']);
  });

  it('deleteSharedEvents takes ids read earlier', async () => {
    const w = world();
    const a = await shared(w);
    await w.db.$transaction(async (tx) => {
      await deleteSharedEvents(tx, 'u1', [a.milestoneId]);
    });
    expect(events(w)).toHaveLength(2);
    // The milestone row is still there and still wants its event: a reconcile restores it (deleteSharedEvents is not a flag).
    await withShared('u1', {}, async () => undefined, w.db, NOW);
    expect(events(w)).toHaveLength(3);
  });

  it('deleting a school removes its events and applications and leaves no orphan', async () => {
    const w = world();
    await shared(w);
    await w.db.medSchool.delete({ where: { id: 's1' } });
    expect(events(w)).toHaveLength(0);
    expect(rows(w, 'medTrackerApplication')).toHaveLength(0);
    expect(await auditRmh(w.db)).toEqual({ orphanEvents: 0, mismatchedCells: 0, missingEvents: 0 });
  });

  it('an account, mid-cycle: some shared, some not, one cycle shared and another not', async () => {
    const w = world();
    const a = await simple(w, 'u1');
    await addMs(w, 'u1', { id: 'ms-u1-hold', applicationId: a.applicationId, type: 'HOLD' });
    await addMs(w, 'u1', { id: 'ms-u1-done', applicationId: a.applicationId, type: 'COMPLETE' });
    const c2 = await addCycle(w, 'u1', 2026, false);
    await addApp(w, 'u1', { id: 'app-u1-old', cycleId: c2, schoolId: 's2' });
    await addMs(w, 'u1', {
      id: 'ms-u1-old',
      applicationId: 'app-u1-old',
      type: 'INTERVIEW',
      date: new Date('2025-11-20T00:00:00.000Z'),
    });
    await simple(w, 'u2');
    await simple(w, 'u3');
    expect(events(w)).toHaveLength(4);

    const r = await eraseSharedMedEvents('u1', w.db);
    expect(r).toEqual({ events: 2 });
    expect(
      events(w)
        .map((e) => e.dedupeHash)
        .sort(),
    ).toEqual([hash('ms-u2'), hash('ms-u3')].sort());
    expect(rmhCounts(w).map((c) => c.count)).toEqual([2]);
    expect(
      rows(w, 'medTrackerCycle')
        .filter((c) => c.userId === 'u1')
        .every((c) => c.shareAnonymously === false),
    ).toBe(true);
    // Idempotent: a re-run after a failed sweep finds nothing to do.
    expect(await eraseSharedMedEvents('u1', w.db)).toEqual({ events: 0 });
    // Then the erasure transaction deletes the tracker rows; nothing is left to orphan.
    await w.db.$transaction(async (tx) => {
      await tx.medTrackerCycle.deleteMany({ where: { userId: 'u1' } });
    });
    expect(await auditRmh(w.db)).toEqual({ orphanEvents: 0, mismatchedCells: 0, missingEvents: 0 });
    expectConsistent(w);
  });
});

describe('the secret (Review Focus 7, D8)', () => {
  it('shareSecret is null when unset or shorter than 16 characters', () => {
    expect(shareSecret({})).toBeNull();
    expect(shareSecret({ MEDSCHOOLS_DEDUPE_SECRET: 'short' })).toBeNull();
    expect(shareSecret({ MEDSCHOOLS_DEDUPE_SECRET: 'x'.repeat(16) })).toBe('x'.repeat(16));
  });

  it('sharing on with no secret throws and writes nothing', async () => {
    const w = world();
    await simple(w, 'u1', { share: false });
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(setShare(w, 'u1', 2027, true)).rejects.toBeInstanceOf(SharingUnavailableError);
    expect(events(w)).toHaveLength(0);
    expect(rmhCounts(w)).toHaveLength(0);
    expect(rows(w, 'medTrackerCycle')[0]!.shareAnonymously).toBe(false); // the flag write rolled back with it
  });

  it('sharing off with no event stored needs no secret', async () => {
    const w = world();
    const a = await simple(w, 'u1', { share: false });
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(withShared('u1', {}, async () => undefined, w.db, NOW)).resolves.toBeUndefined();
    await addMs(w, 'u1', { id: 'ms-x', applicationId: a.applicationId, type: 'HOLD' });
    await withSharedErase('u1', {}, (tx) => tx.medTrackerMilestone.delete({ where: { id: 'ms-x' } }), w.db, NOW);
    await expect(eraseSharedMedEvents('u1', w.db)).resolves.toEqual({ events: 0 });
  });

  it('sharing off with events stored throws (fails closed rather than pretending)', async () => {
    const w = world();
    await simple(w, 'u1');
    expect(events(w)).toHaveLength(1);
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(setShare(w, 'u1', 2027, false)).rejects.toBeInstanceOf(SharingUnavailableError);
    await expect(eraseSharedMedEvents('u1', w.db)).rejects.toBeInstanceOf(SharingUnavailableError);
    expect(events(w)).toHaveLength(1);
  });

  it('with no secret, a member who never shared is not refused because another member has an event in the cell', async () => {
    const w = world();
    await simple(w, 'u1'); // u1 shares: one INTERVIEW event at s1 on DAY
    const b = await simple(w, 'u2', { share: false }); // u2 same cell, never shared
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(
      withSharedErase('u2', {}, (tx) => tx.medTrackerMilestone.delete({ where: { id: b.milestoneId } }), w.db, NOW),
    ).resolves.toMatchObject({ id: 'ms-u2' });
    expect(rows(w, 'medTrackerMilestone').map((m) => m.id)).toEqual(['ms-u1']);
    expect(events(w)).toHaveLength(1);
  });

  it('with no secret, a member who once shared (and switched off) is still refused when an event could exist in the cell', async () => {
    const w = world();
    const a = await simple(w, 'u1');
    await setShare(w, 'u1', 2027, false); // the event is gone, the cell has no events, everShared stays
    expect(rows(w, 'medTrackerCycle')[0]!.everShared).toBe(true);
    await simple(w, 'u2'); // another member's event in the same cell
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(
      withSharedErase('u1', {}, (tx) => tx.medTrackerMilestone.delete({ where: { id: a.milestoneId } }), w.db, NOW),
    ).rejects.toBeInstanceOf(SharingUnavailableError);
    expect(
      rows(w, 'medTrackerMilestone')
        .map((m) => m.id)
        .sort(),
    ).toEqual(['ms-u1', 'ms-u2']);
  });

  it('upsertCycleRow sets everShared when sharing is first on and never clears it', async () => {
    const w = world();
    addUser(w, 'u1');
    await w.db.$transaction(async (tx) => {
      await upsertCycleRow(tx, 'u1', 2027, { shareAnonymously: false });
      expect(rows(w, 'medTrackerCycle')[0]!.everShared).toBe(false);
      await upsertCycleRow(tx, 'u1', 2027, { shareAnonymously: true });
      expect(rows(w, 'medTrackerCycle')[0]!.everShared).toBe(true);
      await upsertCycleRow(tx, 'u1', 2027, { shareAnonymously: false });
      expect(rows(w, 'medTrackerCycle')[0]!.everShared).toBe(true);
    });
  });

  it('auditRmh needs the secret', async () => {
    const w = world();
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(auditRmh(w.db)).rejects.toBeInstanceOf(SharingUnavailableError);
  });
});

describe('Q8: a new account cannot share', () => {
  it('accountOldEnoughToShare is exactly 7 days', () => {
    const now = new Date('2026-11-20T12:00:00.000Z');
    expect(accountOldEnoughToShare(new Date('2026-11-13T12:00:00.000Z'), now)).toBe(true);
    expect(accountOldEnoughToShare(new Date('2026-11-13T12:00:00.001Z'), now)).toBe(false);
  });

  it('turning sharing on for a 3-day-old account throws and changes nothing', async () => {
    const w = world();
    const u = 'young';
    w.tables.user.push({ id: u, createdAt: new Date(NOW.getTime() - 3 * 86_400_000) });
    const cycleId = await addCycle(w, u, 2027, false);
    await addApp(w, u, { id: 'app-y', cycleId, schoolId: 's1' });
    await addMs(w, u, { id: 'ms-y', applicationId: 'app-y', type: 'INTERVIEW' });
    await expect(setShare(w, u, 2027, true)).rejects.toBeInstanceOf(AccountTooNewError);
    expect(events(w)).toHaveLength(0);
    expect(rows(w, 'medTrackerCycle')[0]!.shareAnonymously).toBe(false);
  });

  it('a young account with only private milestones can still flip the switch, and turning it off needs no age', async () => {
    const w = world();
    w.tables.user.push({ id: 'young', createdAt: new Date(NOW.getTime() - 86_400_000) });
    const cycleId = await addCycle(w, 'young', 2027, false);
    await addApp(w, 'young', { id: 'app-y', cycleId, schoolId: 's1' });
    await addMs(w, 'young', { id: 'ms-y', applicationId: 'app-y', type: 'COMPLETE' });
    await expect(setShare(w, 'young', 2027, true)).resolves.toBeDefined();
    await expect(setShare(w, 'young', 2027, false)).resolves.toBeDefined();
  });
});

describe('locks', () => {
  it.each([
    ['s1', 's2', 's3'],
    ['s3', 's2', 's1'],
    ['s2', 's3', 's1'],
  ])(
    'takes med-tracker:<user> first, then med-rmh:<school> in ascending order (insertion order %s %s %s)',
    async (...order) => {
      const w = world();
      addUser(w, 'u1');
      const cycleId = await addCycle(w, 'u1', 2027, false);
      for (const s of order) {
        await addApp(w, 'u1', { id: `a-${s}`, cycleId, schoolId: s });
        await addMs(w, 'u1', { id: `m-${s}`, applicationId: `a-${s}`, type: 'INTERVIEW' });
      }
      w.lockLog.length = 0;
      await setShare(w, 'u1', 2027, true);
      expect(w.lockLog).toEqual([['med-tracker:u1', 'med-rmh:s1', 'med-rmh:s2', 'med-rmh:s3']]);
      w.lockLog.length = 0;
      await setShare(w, 'u1', 2027, false);
      expect(w.lockLog).toEqual([['med-tracker:u1', 'med-rmh:s1', 'med-rmh:s2', 'med-rmh:s3']]);
    },
  );

  it('a transaction that writes no event takes only the user lock', async () => {
    const w = world();
    await simple(w, 'u1', { share: false });
    w.lockLog.length = 0;
    await withShared('u1', {}, async () => undefined, w.db, NOW);
    expect(w.lockLog).toEqual([['med-tracker:u1']]);
  });

  it('reconcileShared on its own locks the user first', async () => {
    const w = world();
    await simple(w, 'u1');
    w.lockLog.length = 0;
    await w.db.$transaction((tx) => reconcileShared(tx, 'u1', {}, NOW));
    expect(w.lockLog[0]![0]).toBe('med-tracker:u1');
  });
});

describe('auditRmh', () => {
  it('a healthy state is all zeros', async () => {
    const w = world();
    await simple(w, 'u1');
    await simple(w, 'u2', { share: false });
    expect(await auditRmh(w.db)).toEqual({ orphanEvents: 0, mismatchedCells: 0, missingEvents: 0 });
  });

  it('an event whose hash matches no milestone is an orphan', async () => {
    const w = world();
    await simple(w, 'u1');
    w.tables.medCycleEvent.push({ ...events(w)[0]!, id: 'x', dedupeHash: 'f'.repeat(64) });
    expect((await auditRmh(w.db)).orphanEvents).toBe(1);
  });

  it('a count row that differs from the grouped events is a mismatch', async () => {
    const w = world();
    await simple(w, 'u1');
    rmhCounts(w)[0]!.contributors = 5;
    expect((await auditRmh(w.db)).mismatchedCells).toBe(1);
    rmhCounts(w)[0]!.contributors = 1;
    w.tables.medCycleCount.push({
      id: 'stray',
      schoolId: 's3',
      program: 'REG',
      cycleYear: 2027,
      date: DAY,
      eventType: 'HOLD',
      source: 'RMH',
      count: 1,
      contributors: 1,
    });
    expect((await auditRmh(w.db)).mismatchedCells).toBe(1);
  });

  it('a shared milestone with no event is missing', async () => {
    const w = world();
    await simple(w, 'u1');
    w.tables.medCycleEvent.length = 0;
    w.tables.medCycleCount.length = 0;
    expect((await auditRmh(w.db)).missingEvents).toBe(1);
  });
});

describe('withSharedErase deletes events only for what the closure deleted', () => {
  async function twoMilestones(w: World) {
    const ids = await simple(w, 'u1', { type: 'INTERVIEW' });
    await addMs(w, 'u1', { id: 'ms-u1-b', applicationId: ids.applicationId, type: 'SECONDARY', date: DAY2 });
    return ids;
  }

  it('a closure narrower than its scope leaves the other milestone shared and counted', async () => {
    const w = world();
    const ids = await twoMilestones(w);
    expect(events(w)).toHaveLength(2);
    await withSharedErase(
      'u1',
      { applicationId: ids.applicationId },
      (tx) => tx.medTrackerMilestone.delete({ where: { id: ids.milestoneId } }),
      w.db,
      NOW,
    );
    expect(events(w).map((e) => e.eventType)).toEqual(['SECONDARY']);
    expect(rmhCounts(w).map((c) => [c.eventType, c.count, c.contributors])).toEqual([['SECONDARY', 1, 1]]);
    expectConsistent(w);
    expect(await auditRmh(w.db)).toEqual({ orphanEvents: 0, mismatchedCells: 0, missingEvents: 0 });
  });

  it('a closure that deletes nothing changes nothing', async () => {
    const w = world();
    const ids = await twoMilestones(w);
    const before = JSON.stringify([w.tables.medCycleEvent, w.tables.medCycleCount]);
    await withSharedErase('u1', { cycleYear: 2027 }, async () => 'noop', w.db, NOW);
    await withSharedErase(
      'u1',
      {},
      async (tx) => tx.medTrackerMilestone.deleteMany({ where: { id: 'nope' } }),
      w.db,
      NOW,
    );
    expect(JSON.stringify([w.tables.medCycleEvent, w.tables.medCycleCount])).toBe(before);
    expectConsistent(w);
    expect(await auditRmh(w.db)).toEqual({ orphanEvents: 0, mismatchedCells: 0, missingEvents: 0 });
    expect(ids.milestoneId).toBeTruthy();
  });

  it('a nothing-deleted call needs no secret and does not 503', async () => {
    const w = world();
    await twoMilestones(w);
    delete process.env.MEDSCHOOLS_DEDUPE_SECRET;
    await expect(withSharedErase('u1', {}, async () => 0, w.db, NOW)).resolves.toBe(0);
  });
});

describe('eraseSharedMedEvents', () => {
  it('opens no transaction and takes no lock for a member who never had a tracker', async () => {
    const w = world();
    addUser(w, 'nobody');
    expect(await eraseSharedMedEvents('nobody', w.db)).toEqual({ events: 0 });
    expect(w.lockLog).toHaveLength(0);
  });
});

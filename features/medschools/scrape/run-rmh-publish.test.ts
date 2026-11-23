import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from './test-support';
import { RMH_PUBLISH_CRON, RMH_PUBLISH_MIN_INTERVAL_MS, publishRmhCounts, runRmhPublish } from './run-rmh-publish';

// The public readers run against the same real database as the job in the second half of this file.
const real = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy({}, { get: (_t, k) => (real.client as Record<string | symbol, unknown>)[k] }),
}));

import { getActivity, getHistory, listSchools } from '../api/read.server';

const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
const T0 = new Date('2027-11-21T00:05:00.000Z');

describe('the schedule', () => {
  it('is 00:05 UTC daily with a persisted minimum interval under a day', () => {
    expect(RMH_PUBLISH_CRON).toBe('5 0 * * *');
    expect(RMH_PUBLISH_MIN_INTERVAL_MS).toBeLessThan(24 * 3_600_000);
  });
});

describe('runRmhPublish (the run ledger)', () => {
  function setup() {
    const f = createFakePrisma();
    const raw = vi.fn(async (..._a: unknown[]) => [{ published: 2n, removed: 1n }]);
    const lock = vi.fn(async (..._a: unknown[]) => 0);
    const db = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ $executeRaw: lock, $queryRaw: raw }),
    };
    let t = T0;
    const run = (trigger: 'CRON' | 'MANUAL' = 'CRON') =>
      runRmhPublish({ prisma: f.prisma, db: db as never, now: () => t, log }, { trigger });
    return { f, raw, lock, run, at: (d: Date) => (t = d) };
  }
  const runs = (f: ReturnType<typeof setup>['f']) => f.tables.medSourceRun as Record<string, unknown>[];

  it('runs once, records an OK run with the counts, and does not repeat inside the interval (a deploy does not re-fire it)', async () => {
    const s = setup();
    expect(await s.run()).toMatchObject({ status: 'OK', outcome: 'ran', published: 2, removed: 1 });
    expect(s.raw).toHaveBeenCalledTimes(1);
    expect(runs(s.f)[0]).toMatchObject({ source: 'RMH', job: 'rmh-publish', status: 'OK', trigger: 'CRON' });
    // The worker restarts at 00:40 and the queue fires again: skipped, nothing written.
    s.at(new Date('2027-11-21T00:40:00.000Z'));
    expect(await s.run()).toMatchObject({ status: 'OK', outcome: 'skipped-min-interval' });
    expect(s.raw).toHaveBeenCalledTimes(1);
    // A skipped row does not extend the window: the next day's run goes ahead.
    s.at(new Date('2027-11-22T00:05:00.000Z'));
    expect(await s.run()).toMatchObject({ outcome: 'ran' });
    expect(s.raw).toHaveBeenCalledTimes(2);
  });

  it('a manual run bypasses the interval; a failed run is recorded and does not block the next one', async () => {
    const s = setup();
    await s.run();
    expect(await s.run('MANUAL')).toMatchObject({ outcome: 'ran' });
    expect(s.raw).toHaveBeenCalledTimes(2);
    const f = setup();
    f.raw.mockRejectedValueOnce(new Error('boom'));
    expect(await f.run()).toMatchObject({ status: 'FAILED' });
    expect(runs(f.f)[0]).toMatchObject({ status: 'FAILED', error: 'boom' });
    expect(await f.run()).toMatchObject({ status: 'OK', outcome: 'ran' });
  });

  it('takes the per-school locks before the statement, and the statement names only RMH rows', async () => {
    const s = setup();
    await s.run();
    const lockSql = (s.lock.mock.calls[0]![0] as string[]).join('?');
    expect(lockSql).toContain('pg_advisory_xact_lock');
    expect(lockSql).toContain("'med-rmh:'");
    const sql = (s.raw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toContain('\'RMH\'::"MedSource"');
    expect(sql.match(/'RMH'::"MedSource"/g)).toHaveLength(2);
    expect(sql).not.toContain('contributors" = 0');
  });
});

// The snapshot is one SQL statement, so its tests need a real Postgres: a scratch database on localhost only.
const url = process.env.DATABASE_URL ?? '';
const dbName = /\/([^/?]+)(\?|$)/.exec(url)?.[1] ?? '';
const usable = /@(127\.0\.0\.1|localhost)[:/]/.test(url) && dbName.includes('scratch');

describe.skipIf(!usable)('the daily snapshot against a real database', () => {
  let pg: PrismaClient;
  let schoolId = '';
  const NOW = new Date('2027-11-21T12:00:00.000Z');
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

  beforeAll(async () => {
    pg = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
    real.client = pg;
    const slug = `publish-test-${process.pid}`;
    await pg.medSchool.deleteMany({ where: { slug } });
    schoolId = (
      await pg.medSchool.create({
        data: { slug, name: 'Publish Test', shortName: 'PT', degree: 'MD', city: 'X', state: 'NC' },
        select: { id: true },
      })
    ).id;
  });
  afterAll(async () => {
    await pg.medSchool.deleteMany({ where: { id: schoolId } });
    await pg.$disconnect();
  });
  beforeEach(async () => {
    await pg.medCycleCount.deleteMany({ where: { schoolId } });
  });

  const cell = (date: string, count: number, extra: Record<string, unknown> = {}) =>
    pg.medCycleCount.create({
      data: {
        schoolId,
        program: 'REG',
        cycleYear: 2027,
        date: d(date),
        eventType: 'INTERVIEW',
        source: 'RMH',
        count,
        contributors: count,
        ...extra,
      },
    });
  const rmhDays = async () => {
    const res = await getActivity('publish-test-' + process.pid, { cycle: 2027 }, NOW);
    return res!.types[0]!.sources.find((s) => s.source === 'RMH')?.days ?? [];
  };

  it('a back-dated save changes no public read until the job runs', async () => {
    await cell('2027-11-10', 3); // created since the last snapshot: never published
    expect(await rmhDays()).toEqual([]);
    await publishRmhCounts(pg);
    expect(await rmhDays()).toEqual([{ date: '2027-11-10', count: 3 }]);

    // Two members back-date a milestone into that past cell and into a new one: the live rows move, the public does not.
    await pg.medCycleCount.updateMany({
      where: { schoolId, date: d('2027-11-10') },
      data: { count: 4, contributors: 4 },
    });
    await cell('2027-11-11', 3);
    expect(await rmhDays()).toEqual([{ date: '2027-11-10', count: 3 }]);
    const hist = await getHistory('publish-test-' + process.pid, {}, NOW);
    expect(JSON.stringify(hist)).not.toContain('"total":4');
    const list = await listSchools({}, NOW);
    expect(list.schools.find((s) => s.slug.startsWith('publish-test'))?.reported ?? null).toEqual({
      source: 'RMH',
      count: 3,
    });

    await publishRmhCounts(pg);
    expect(await rmhDays()).toEqual([
      { date: '2027-11-10', count: 4 },
      { date: '2027-11-11', count: 3 },
    ]);
  });

  it('a cell that drops to 0 stays visible until the job runs, then the row goes', async () => {
    await cell('2027-11-10', 3);
    await publishRmhCounts(pg);
    await pg.medCycleCount.updateMany({ where: { schoolId }, data: { count: 0, contributors: 0 } });
    expect(await pg.medCycleCount.count({ where: { schoolId } })).toBe(1); // the writer keeps the row
    expect(await rmhDays()).toEqual([{ date: '2027-11-10', count: 3 }]);
    const r = await publishRmhCounts(pg);
    expect(r).toEqual({ published: 0, removed: 1 });
    expect(await pg.medCycleCount.count({ where: { schoolId } })).toBe(0);
    expect(await rmhDays()).toEqual([]);
  });

  it('is idempotent and never touches another source', async () => {
    await cell('2027-11-10', 5);
    await pg.medCycleCount.create({
      data: {
        schoolId,
        program: 'REG',
        cycleYear: 2027,
        date: d('2027-11-10'),
        eventType: 'INTERVIEW',
        source: 'ADMIT',
        count: 0,
        contributors: null,
      },
    });
    expect(await publishRmhCounts(pg)).toEqual({ published: 1, removed: 0 });
    expect(await publishRmhCounts(pg)).toEqual({ published: 0, removed: 0 });
    const admit = await pg.medCycleCount.findFirst({ where: { schoolId, source: 'ADMIT' } });
    expect(admit).toMatchObject({ count: 0, publishedCount: null, publishedContributors: null });
    expect(await pg.medCycleCount.findFirst({ where: { schoolId, source: 'RMH' } })).toMatchObject({
      publishedCount: 5,
      publishedContributors: 5,
    });
  });

  it('a published cell under the floor stays hidden, and today stays held back after publishing', async () => {
    await cell('2027-11-10', 2);
    await cell('2027-11-21', 9); // today (UTC)
    await publishRmhCounts(pg);
    expect(await rmhDays()).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { createDailyBudget } from './request-budget';
import { createFakePrisma } from './test-support';

describe('createDailyBudget (fake clock)', () => {
  const D1 = Date.UTC(2026, 10, 23, 23, 59, 0);
  const rows = (f: ReturnType<typeof createFakePrisma>) =>
    f.tables.medRequestBudget as Array<{ key: string; day: Date; requests: number }>;

  it('allows exactly the limit per UTC day, then refuses', async () => {
    const f = createFakePrisma();
    const b = createDailyBudget(
      f.prisma,
      'ADMIT',
      () => 3,
      () => new Date(D1),
    );
    expect([await b.take(), await b.take(), await b.take(), await b.take()]).toEqual([true, true, true, false]);
    expect(await b.used()).toBe(3);
    expect(await b.remaining()).toBe(0);
    expect(rows(f)).toEqual([expect.objectContaining({ key: 'ADMIT', requests: 3 })]);
  });

  it('survives a restart: a new budget object resumes from the stored count', async () => {
    const f = createFakePrisma();
    const a = createDailyBudget(
      f.prisma,
      'ADMIT',
      () => 5,
      () => new Date(D1),
    );
    await a.take();
    await a.take();
    const restarted = createDailyBudget(
      f.prisma,
      'ADMIT',
      () => 5,
      () => new Date(D1),
    );
    expect(await restarted.remaining()).toBe(3);
    expect([await restarted.take(), await restarted.take(), await restarted.take(), await restarted.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('resets at the UTC day boundary and keeps yesterday on its own row', async () => {
    const f = createFakePrisma();
    let t = D1;
    const b = createDailyBudget(
      f.prisma,
      'ADMIT',
      () => 1,
      () => new Date(t),
    );
    expect(await b.take()).toBe(true);
    expect(await b.take()).toBe(false);
    t += 2 * 60_000; // 00:01 UTC the next day
    expect(await b.take()).toBe(true);
    expect(await b.take()).toBe(false);
    expect(rows(f).map((r) => [r.day.toISOString().slice(0, 10), r.requests])).toEqual([
      ['2026-11-23', 1],
      ['2026-11-24', 1],
    ]);
  });

  it('keys are independent, so a job quota and a host budget do not draw on each other', async () => {
    const f = createFakePrisma();
    const host = createDailyBudget(
      f.prisma,
      'ADMIT',
      () => 2,
      () => new Date(D1),
    );
    const quota = createDailyBudget(
      f.prisma,
      'ADMIT:history',
      () => 1,
      () => new Date(D1),
    );
    expect(await quota.take()).toBe(true);
    expect(await quota.take()).toBe(false);
    expect(await host.take()).toBe(true);
    expect(await host.take()).toBe(true);
    expect(await host.take()).toBe(false);
  });

  it('reads the limit on every call, so an env change takes effect; takeMany is all-or-nothing', async () => {
    const f = createFakePrisma();
    let limit = 2;
    const b = createDailyBudget(
      f.prisma,
      'ADMIT',
      () => limit,
      () => new Date(D1),
    );
    expect(await b.takeMany(3)).toBe(false);
    expect(await b.used()).toBe(0);
    limit = 3;
    expect(await b.takeMany(3)).toBe(true);
  });

  it('concurrent takes never exceed the limit', async () => {
    const f = createFakePrisma({
      jitter: async () => {
        await Promise.resolve();
      },
    });
    const b = createDailyBudget(
      f.prisma,
      'ADMIT',
      () => 5,
      () => new Date(D1),
    );
    const results = await Promise.all(Array.from({ length: 12 }, () => b.take()));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it('refuses (closed) when the count cannot be written', async () => {
    const f = createFakePrisma();
    f.prisma.medRequestBudget.upsert = (async () => {
      throw new Error('db down');
    }) as never;
    const b = createDailyBudget(
      f.prisma,
      'ADMIT',
      () => 5,
      () => new Date(D1),
    );
    expect(await b.take()).toBe(false);
  });
});

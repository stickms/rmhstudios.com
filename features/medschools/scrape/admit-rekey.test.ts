import { describe, expect, it } from 'vitest';
import { ADMIT_REKEY_JOB, ensureAdmitRekey } from './admit-rekey';
import { createFakePrisma } from './test-support';

const NOW = () => new Date('2026-11-23T00:00:00.000Z');
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

function seed() {
  const f = createFakePrisma();
  f.tables.medSchool!.push({ id: 's1', active: true });
  f.tables.medCycleEvent!.push(
    { id: 'e1', schoolId: 's1', source: 'ADMIT', dedupeHash: 'old1', program: 'REG' },
    { id: 'e2', schoolId: 's1', source: 'ADMIT', dedupeHash: 'old2', program: 'PHD' },
    { id: 'e3', schoolId: 's1', source: 'SDN', dedupeHash: 'sdn1', program: 'REG' },
    { id: 'e4', schoolId: 's1', source: 'RMH', dedupeHash: 'rmh1', program: 'REG' },
  );
  f.tables.medCycleCount!.push(
    { id: 'c1', schoolId: 's1', source: 'ADMIT', count: 3 },
    { id: 'c2', schoolId: 's1', source: 'SDN', count: 2 },
    { id: 'c3', schoolId: 's1', source: 'CYCLETRACK', count: 9 },
  );
  return f;
}
const rekeyRuns = (f: ReturnType<typeof seed>) =>
  (f.tables.medSourceRun as Array<{ job: string; status: string; stats?: unknown }>).filter(
    (r) => r.job === ADMIT_REKEY_JOB,
  );

describe('ensureAdmitRekey', () => {
  it('deletes every ADMIT event and count cell and nothing of another source, then records the done flag', async () => {
    const f = seed();
    expect(await ensureAdmitRekey(f.prisma, quiet, NOW)).toBe(true);
    expect((f.tables.medCycleEvent as Array<{ source: string }>).map((e) => e.source).sort()).toEqual(['RMH', 'SDN']);
    expect((f.tables.medCycleCount as Array<{ source: string }>).map((e) => e.source).sort()).toEqual([
      'CYCLETRACK',
      'SDN',
    ]);
    expect(rekeyRuns(f)).toEqual([
      expect.objectContaining({ status: 'OK', stats: { eventsDeleted: 2, cellsDeleted: 1 } }),
    ]);
  });

  it('runs at most once: later calls (even with fresh ADMIT rows and a fresh process) delete nothing', async () => {
    const f = seed();
    await ensureAdmitRekey(f.prisma, quiet, NOW);
    f.tables.medCycleEvent!.push({ id: 'n1', schoolId: 's1', source: 'ADMIT', dedupeHash: 'member1', program: 'REG' });
    // the in-process memo is keyed by the prisma object; a new object models a restart and must read the flag
    const restarted = Object.create(f.prisma) as typeof f.prisma;
    expect(await ensureAdmitRekey(restarted, quiet, NOW)).toBe(true);
    expect(await ensureAdmitRekey(f.prisma, quiet, NOW)).toBe(true);
    expect((f.tables.medCycleEvent as Array<{ source: string }>).filter((e) => e.source === 'ADMIT')).toHaveLength(1);
    expect(rekeyRuns(f)).toHaveLength(1);
  });

  it('concurrent callers share one attempt', async () => {
    const f = seed();
    const [a, b] = await Promise.all([ensureAdmitRekey(f.prisma, quiet, NOW), ensureAdmitRekey(f.prisma, quiet, NOW)]);
    expect([a, b]).toEqual([true, true]);
    expect(rekeyRuns(f)).toHaveLength(1);
  });

  it('a failed attempt records FAILED, reports false, and is retried by the next call', async () => {
    const f = seed();
    const real = f.prisma.medCycleCount.deleteMany;
    let fail = true;
    f.prisma.medCycleCount.deleteMany = (async (a: never) => {
      if (fail) throw new Error('boom');
      return real(a);
    }) as typeof real;
    expect(await ensureAdmitRekey(f.prisma, quiet, NOW)).toBe(false);
    expect(rekeyRuns(f)[0]).toMatchObject({ status: 'FAILED' });
    fail = false;
    expect(await ensureAdmitRekey(f.prisma, quiet, NOW)).toBe(true);
    expect(rekeyRuns(f).map((r) => r.status)).toEqual(['FAILED', 'OK']);
    expect((f.tables.medCycleCount as Array<{ source: string }>).some((c) => c.source === 'ADMIT')).toBe(false);
  });

  it('closes a stale RUNNING row of a killed attempt', async () => {
    const f = seed();
    f.tables.medSourceRun!.push({ id: 'old', source: 'ADMIT', job: ADMIT_REKEY_JOB, status: 'RUNNING' });
    await ensureAdmitRekey(f.prisma, quiet, NOW);
    expect(rekeyRuns(f).map((r) => r.status)).toEqual(['FAILED', 'OK']);
  });
});

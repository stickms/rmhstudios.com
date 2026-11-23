import { describe, expect, it } from 'vitest';
import {
  commitAdmitEvents,
  loadMemberStates,
  markMember,
  memberSettled,
  mergeCandidates,
  pruneMembers,
  type AdmitCandidate,
} from './admit-events';
import { rollupEventCounts } from './rollup-events';
import { createFakePrisma } from './test-support';

const cand = (over: Partial<AdmitCandidate> = {}): AdmitCandidate => ({
  schoolId: 's1',
  cycleYear: 2027,
  program: 'REG',
  eventType: 'ACCEPTANCE',
  occurredAt: new Date('2026-11-12T10:00:00.000Z'),
  dedupeHash: 'h1',
  ...over,
});

describe('mergeCandidates', () => {
  it('collapses one key to the earliest date and prefers a known program', () => {
    const out = mergeCandidates([
      cand({ occurredAt: new Date('2026-11-12T10:00:00.000Z'), program: null }),
      cand({ occurredAt: new Date('2026-11-10T10:00:00.000Z'), program: 'PHD' }),
      cand({ dedupeHash: 'h2' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ occurredAt: new Date('2026-11-10T10:00:00.000Z'), program: 'PHD' });
  });
});

describe('commitAdmitEvents', () => {
  function seed() {
    const f = createFakePrisma();
    f.tables.medSchool!.push({ id: 's1', active: true });
    return f;
  }

  it('creates unseen events and reports their cells; a repeat is a no-op', async () => {
    const f = seed();
    const first = await commitAdmitEvents(f.prisma, [cand()]);
    expect(first).toMatchObject({ created: 1, moved: 0, existing: 0 });
    expect(first.touched).toEqual([{ schoolId: 's1', program: 'REG', cycleYear: 2027, date: '2026-11-12' }]);
    const again = await commitAdmitEvents(f.prisma, [cand()]);
    expect(again).toMatchObject({ created: 0, moved: 0, existing: 1 });
    expect(f.tables.medCycleEvent).toHaveLength(1);
  });

  it('first report wins, but an earlier date moves the stored event and the day counts follow (no double count)', async () => {
    const f = seed();
    const r1 = await commitAdmitEvents(f.prisma, [cand()]);
    await rollupEventCounts(f.prisma, { source: 'ADMIT', touched: r1.touched });
    expect(f.tables.medCycleCount).toHaveLength(1);

    const r2 = await commitAdmitEvents(f.prisma, [cand({ occurredAt: new Date('2026-11-09T10:00:00.000Z') })]);
    expect(r2).toMatchObject({ created: 0, moved: 1 });
    await rollupEventCounts(f.prisma, { source: 'ADMIT', touched: r2.touched });

    const events = f.tables.medCycleEvent as Array<{ occurredAt: Date }>;
    expect(events).toHaveLength(1);
    expect(events[0]!.occurredAt.toISOString()).toBe('2026-11-09T10:00:00.000Z');
    const cells = f.tables.medCycleCount as Array<{ date: Date; count: number }>;
    expect(cells.map((c) => [c.date.toISOString().slice(0, 10), c.count])).toEqual([['2026-11-09', 1]]);

    // a later sighting never moves it forward
    const r3 = await commitAdmitEvents(f.prisma, [cand({ occurredAt: new Date('2026-11-20T10:00:00.000Z') })]);
    expect(r3).toMatchObject({ created: 0, moved: 0, existing: 1 });
    expect((f.tables.medCycleEvent as Array<{ occurredAt: Date }>)[0]!.occurredAt.toISOString()).toBe(
      '2026-11-09T10:00:00.000Z',
    );
  });

  it('a day-only sighting on the same day never displaces an exact time; an exact time replaces a day-only one', async () => {
    const f = seed();
    await commitAdmitEvents(f.prisma, [cand({ occurredAt: new Date('2026-11-12T18:42:00.000Z') })]);
    const r = await commitAdmitEvents(f.prisma, [cand({ occurredAt: new Date('2026-11-12T00:00:00.000Z') })]);
    expect(r).toMatchObject({ moved: 0, existing: 1 });
    const events = f.tables.medCycleEvent as Array<{ occurredAt: Date }>;
    expect(events[0]!.occurredAt.toISOString()).toBe('2026-11-12T18:42:00.000Z');

    const g = seed();
    await commitAdmitEvents(g.prisma, [cand({ occurredAt: new Date('2026-11-12T00:00:00.000Z') })]);
    await commitAdmitEvents(g.prisma, [cand({ occurredAt: new Date('2026-11-12T18:42:00.000Z') })]);
    expect((g.tables.medCycleEvent as Array<{ occurredAt: Date }>)[0]!.occurredAt.toISOString()).toBe(
      '2026-11-12T18:42:00.000Z',
    );
  });

  it('merging candidates keeps the exact time of the same day, and the earlier day otherwise', () => {
    const exact = cand({ occurredAt: new Date('2026-11-12T18:42:00.000Z') });
    const dayOnly = cand({ occurredAt: new Date('2026-11-12T00:00:00.000Z') });
    expect(mergeCandidates([exact, dayOnly])[0]!.occurredAt.toISOString()).toBe('2026-11-12T18:42:00.000Z');
    expect(mergeCandidates([dayOnly, exact])[0]!.occurredAt.toISOString()).toBe('2026-11-12T18:42:00.000Z');
    const earlier = cand({ occurredAt: new Date('2026-11-11T00:00:00.000Z') });
    expect(mergeCandidates([exact, earlier])[0]!.occurredAt.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  it('fills in a program the first sighting could not read, in the same cell', async () => {
    const f = seed();
    const r1 = await commitAdmitEvents(f.prisma, [cand({ program: null })]);
    expect(r1.touched).toEqual([]);
    const r2 = await commitAdmitEvents(f.prisma, [cand({ program: 'PHD' })]);
    expect(r2.moved).toBe(1);
    expect(r2.touched).toEqual([{ schoolId: 's1', program: 'PHD', cycleYear: 2027, date: '2026-11-12' }]);
    expect((f.tables.medCycleEvent as Array<{ program: string }>)[0]!.program).toBe('PHD');
  });
});

describe('member progress', () => {
  const NOW = new Date('2026-11-23T00:00:00.000Z');
  it('DONE is settled; FAILED settles after three attempts for a week, then is retried', async () => {
    const f = createFakePrisma();
    await markMember(f.prisma, 'a', 'DONE', NOW);
    for (let i = 0; i < 3; i++) await markMember(f.prisma, 'b', 'FAILED', NOW);
    await markMember(f.prisma, 'c', 'FAILED', NOW);
    const st = await loadMemberStates(f.prisma, ['a', 'b', 'c', 'd']);
    expect(memberSettled(st.get('a'), NOW)).toBe(true);
    expect(st.get('b')!.attempts).toBe(3);
    expect(memberSettled(st.get('b'), NOW)).toBe(true);
    expect(memberSettled(st.get('c'), NOW)).toBe(false);
    expect(memberSettled(st.get('d'), NOW)).toBe(false);
    expect(memberSettled(st.get('b'), new Date(NOW.getTime() + 8 * 86_400_000))).toBe(false);
  });

  it('prunes rows untouched for over 400 days', async () => {
    const f = createFakePrisma();
    f.tables.medAdmitMember!.push(
      { memberHash: 'old', state: 'DONE', attempts: 0, updatedAt: new Date('2025-01-01T00:00:00.000Z') },
      { memberHash: 'new', state: 'DONE', attempts: 0, updatedAt: NOW },
    );
    expect(await pruneMembers(f.prisma, NOW)).toBe(1);
    expect((f.tables.medAdmitMember as Array<{ memberHash: string }>).map((m) => m.memberHash)).toEqual(['new']);
  });
});

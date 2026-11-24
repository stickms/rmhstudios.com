import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { addDays } from '../engine/stats/days';
import { buildWaitCurves, loadObservationRows, runWaitCurves, type TrackerObservationRow } from './run-wait-curves';
import { createFakePrisma } from './test-support';

const ASOF = '2026-11-23';
const row = (i: number, over: Partial<TrackerObservationRow> = {}): TrackerObservationRow => ({
  schoolId: 's1',
  program: 'REG',
  member: `member-secret-${i}`,
  completeOn: '2026-09-01',
  inviteOn: i % 2 === 0 ? addDays('2026-09-01', 10 + i) : null,
  endOn: null,
  ...over,
});
const members = (n: number, over: Partial<TrackerObservationRow> = {}) =>
  Array.from({ length: n }, (_, i) => row(i, over));

describe('buildWaitCurves: weekly bins, the invite floor and the at-risk maximum (R13)', () => {
  it('steps sit only at multiples of 7 and every step carries its at-risk count', () => {
    const c = buildWaitCurves(members(21), ASOF)[0]!;
    expect(c.curve.t.length).toBeGreaterThan(0);
    for (const t of c.curve.t) expect(t % 7).toBe(0);
    expect(c.curve.n).toHaveLength(c.curve.t.length);
    expect(c.curve.n[0]).toBe(21);
  });
  it('needs at least 10 invite events on top of 20 members: 20 members with 9 invites have no curve', () => {
    const withInvites = (n: number) =>
      Array.from({ length: 20 }, (_, i) => row(i, { inviteOn: i < n ? addDays('2026-09-01', 10 + i) : null }));
    expect(buildWaitCurves(withInvites(9), ASOF)).toEqual([]);
    expect(buildWaitCurves(withInvites(10), ASOF)).toHaveLength(1);
  });
  it('maxDay is the last week with 10 members at risk, not the longest follow-up', () => {
    // 20 members complete 84 days before asOf; 10 invited at 10..19 days, 10 waiting. Everyone is censored/invited by day 84.
    const c = buildWaitCurves(members(20, { completeOn: addDays(ASOF, -84) }), ASOF)[0]!;
    expect(c.maxDay).toBe(84);
    // Only 9 still waiting on top of the 11 invited: the 10-at-risk line falls back to the last invite week.
    const rows = Array.from({ length: 20 }, (_, i) =>
      row(i, { completeOn: addDays(ASOF, -84), inviteOn: i < 11 ? addDays(ASOF, -84 + 10 + i) : null }),
    );
    expect(buildWaitCurves(rows, ASOF)[0]!.maxDay).toBe(21);
  });
  it('an end date before COMPLETE drops the observation (and does not count toward the floor)', () => {
    const bad = Array.from({ length: 5 }, (_, i) => row(300 + i, { inviteOn: null, endOn: '2026-08-01' }));
    expect(buildWaitCurves([...members(19), ...bad], ASOF)).toEqual([]);
  });
});

describe('buildWaitCurves: the floor is on distinct members', () => {
  it('19 members: no curve; 20: one; 21: one with members 21', () => {
    expect(buildWaitCurves(members(19), ASOF)).toEqual([]);
    expect(buildWaitCurves(members(20), ASOF)).toHaveLength(1);
    expect(buildWaitCurves(members(21), ASOF)[0]).toMatchObject({ members: 21, schoolId: 's1', program: 'REG' });
  });
  it('one member with two cycles counts once toward the floor, and both feed the curve once it exists', () => {
    const repeat = row(0, { completeOn: '2025-09-01', inviteOn: '2025-09-20' });
    expect(buildWaitCurves([...members(19), repeat], ASOF)).toEqual([]);
    const c = buildWaitCurves([...members(20), repeat], ASOF)[0];
    expect(c?.members).toBe(20);
    // 20 members plus the repeat observation: the invited count includes the second cycle's invite.
    const base = buildWaitCurves(members(20), ASOF)[0];
    expect(c?.invited).toBe((base?.invited ?? 0) + 1);
  });
  it('observations dropped by observationOf do not count toward the floor', () => {
    const bad = Array.from({ length: 5 }, (_, i) => row(100 + i, { inviteOn: '2026-08-01' })); // invite before complete
    expect(buildWaitCurves([...members(19), ...bad], ASOF)).toEqual([]);
    const future = Array.from({ length: 5 }, (_, i) => row(200 + i, { completeOn: '2026-12-01', inviteOn: null }));
    expect(buildWaitCurves([...members(19), ...future], ASOF)).toEqual([]);
  });
  it('keeps school x program pairs apart', () => {
    const rows = [...members(20), ...members(20, { program: 'PHD' }), ...members(10, { schoolId: 's2' })];
    expect(buildWaitCurves(rows, ASOF).map((c) => `${c.schoolId}|${c.program}`)).toEqual(['s1|PHD', 's1|REG']);
  });
});

describe('the SQL', () => {
  it('reads sharing cycles and COMPLETE milestones only', async () => {
    const q = vi.fn(async (..._a: unknown[]) => []);
    await loadObservationRows({ $queryRaw: q as never });
    const sql = (q.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toContain('"shareAnonymously" = true');
    expect(sql).toContain("'COMPLETE'");
    expect(sql).toContain('"med_tracker_milestone"');
  });
});

describe('runWaitCurves', () => {
  const setup = (rows: () => TrackerObservationRow[]) => {
    const f = createFakePrisma();
    const lines: string[] = [];
    const log = {
      info: (l: string) => lines.push(l),
      warn: (l: string) => lines.push(l),
      error: (l: string) => lines.push(l),
    };
    const db = { $queryRaw: vi.fn(async () => rows()) };
    const run = () => runWaitCurves({ prisma: f.prisma, db: db as never, asOf: ASOF, log });
    return { f, db, run, lines };
  };
  const stored = (f: ReturnType<typeof createFakePrisma>) => f.tables.medWaitCurve as Record<string, unknown>[];

  it('stores only aggregates: the write has exactly the pinned key sets', async () => {
    const s = setup(() => members(26));
    expect(await s.run()).toEqual({ curves: 1, removed: 0, kept: 0 });
    const w = s.f.writes[0] as { create: Record<string, unknown>; update: Record<string, unknown> };
    expect(Object.keys(w.create).sort()).toEqual([
      'asOf',
      'curve',
      'invited',
      'maxDay',
      'members',
      'program',
      'schoolId',
    ]);
    expect(Object.keys(w.update).sort()).toEqual(['asOf', 'computedAt', 'curve', 'invited', 'maxDay', 'members']);
    const row = stored(s.f)[0] as { members: number; curve: Record<string, unknown> };
    expect(row.members).toBe(26);
    expect(Object.keys(row.curve).sort()).toEqual(['n', 's', 't']);
    expect(JSON.stringify(s.f.writes)).not.toContain('member-secret');
  });

  it('a member switching sharing off drops the pair to 19 and the next run deletes the row; a pair that never reached the creation margin has nothing to delete', async () => {
    let n = 26;
    const s = setup(() => [...members(n), ...members(5, { schoolId: 's2' })]);
    expect(await s.run()).toEqual({ curves: 1, removed: 0, kept: 0 });
    expect(stored(s.f)).toHaveLength(1);
    n = 19;
    expect(await s.run()).toEqual({ curves: 0, removed: 1, kept: 0 });
    expect(stored(s.f)).toHaveLength(0);
  });

  it('keeps the stored curve until at least 3 more invites (or members) have arrived, then replaces it (delta k-anonymity)', async () => {
    // 26 members, 13 of them invited, then one new invited member per run.
    const base = members(26);
    let extra: TrackerObservationRow[] = [];
    const s = setup(() => [...base, ...extra]);
    await s.run();
    const first = structuredClone(stored(s.f)[0]);
    const writes = () => s.f.writes.filter((w) => 'create' in (w as object)).length;
    const w0 = writes();
    // One more invite, then two more: invited +2, members +2 -> the stored row is left exactly as it was.
    extra = [row(100, { inviteOn: '2026-09-15' })];
    expect(await s.run()).toEqual({ curves: 1, removed: 0, kept: 1 });
    expect(await s.run()).toEqual({ curves: 1, removed: 0, kept: 1 }); // and again: same input, same answer
    extra = [row(100, { inviteOn: '2026-09-15' }), row(101, { inviteOn: '2026-09-16' })];
    expect(await s.run()).toEqual({ curves: 1, removed: 0, kept: 1 });
    expect(writes()).toBe(w0);
    expect(stored(s.f)[0]).toEqual(first);
    // The third new invite crosses the delta: the curve is rebuilt.
    extra = [row(100, { inviteOn: '2026-09-15' }), row(101, { inviteOn: '2026-09-16' }), row(102, { inviteOn: '2026-09-17' })];
    expect(await s.run()).toEqual({ curves: 1, removed: 0, kept: 0 });
    expect(stored(s.f)[0]).toMatchObject({ invited: 16, members: 29 });
  });

  it('three new members who are still waiting also cross the delta, and a stored row in the old shape is rebuilt', async () => {
    let extra: TrackerObservationRow[] = [];
    const s = setup(() => [...members(26), ...extra]);
    await s.run();
    extra = [100, 101, 102].map((i) => row(i, { inviteOn: null }));
    await s.run();
    expect(stored(s.f)[0]).toMatchObject({ invited: 13, members: 29 });
    // A row written before R13 (no `n`) is replaced even with no change.
    (stored(s.f)[0] as { curve: unknown }).curve = { t: [14], s: [0.5] };
    expect(await s.run()).toEqual({ curves: 1, removed: 0, kept: 0 });
    expect((stored(s.f)[0] as { curve: { n: unknown } }).curve.n).toBeDefined();
  });

  it('a row below a floor is deleted at once, however small the change, and one delete serves every pair', async () => {
    let n = 26;
    let invites = true;
    const s = setup(() => [
      ...members(n),
      ...members(26, { schoolId: 's2', inviteOn: null }).map((r, i) =>
        invites && i < 13 ? { ...r, inviteOn: addDays('2026-09-01', 12) } : r,
      ),
    ]);
    expect(await s.run()).toEqual({ curves: 2, removed: 0, kept: 0 });
    invites = false; // s2 drops to zero invites: under the invite floor
    n = 26;
    const before = s.f.writes.length;
    expect(await s.run()).toEqual({ curves: 1, removed: 1, kept: 1 });
    expect(stored(s.f)).toHaveLength(1);
    expect(s.f.writes.slice(before).filter((w) => 'where' in (w as object) && !('data' in (w as object)))).toHaveLength(1);
  });

  it('delete-then-recreate cannot show a new curve one member away: a pair under the creation margin gets no row (hysteresis)', async () => {
    // 24 members, 13 invited: a stored curve. Sharing is switched off by 5 members (19) and the row goes. When members
    // return, a curve at 20-22 members is NOT created; it needs 23 members and 13 invites.
    const withInvites = (n: number, invited: number) =>
      Array.from({ length: n }, (_, i) => row(i, { inviteOn: i < invited ? addDays('2026-09-01', 10 + i) : null }));
    let rows = withInvites(24, 13);
    const s = setup(() => rows);
    await s.run();
    expect(stored(s.f)).toHaveLength(1);
    rows = withInvites(19, 13);
    expect(await s.run()).toMatchObject({ curves: 0, removed: 1 });
    expect(stored(s.f)).toHaveLength(0);
    rows = withInvites(20, 13); // over the floor: a curve is built, but not stored
    expect(await s.run()).toMatchObject({ curves: 1, removed: 0 });
    rows = withInvites(22, 13);
    await s.run();
    expect(stored(s.f)).toHaveLength(0);
    rows = withInvites(23, 12); // members enough, invites 12 < 13
    await s.run();
    expect(stored(s.f)).toHaveLength(0);
    rows = withInvites(23, 13);
    await s.run();
    expect(stored(s.f)).toHaveLength(1);
    // Once it exists, the refresh delta governs it again: 20 members is not a change of 3 more... 23 -> 21 is under 3.
    rows = withInvites(21, 13);
    expect(await s.run()).toMatchObject({ curves: 1, kept: 1 });
    expect(stored(s.f)[0]).toMatchObject({ members: 23 });
  });

  it('opens the interactive transaction with a 60 s timeout and a 10 s wait', async () => {
    const s = setup(() => members(21));
    const spy = vi.spyOn(s.f.prisma, '$transaction');
    await s.run();
    expect(spy.mock.calls[0]?.[1]).toEqual({ timeout: 60000, maxWait: 10000 });
  });

  it('a failing query is reported with a fixed message: no member or date reaches the log or the error', async () => {
    const s = setup(() => []);
    s.db.$queryRaw.mockRejectedValue(new Error('bind failed for member-secret-3 on 2026-09-01'));
    await expect(s.run()).rejects.toThrow('wait-curve query failed');
    await s.run().catch((e: Error) => expect(e.message).not.toContain('member-secret'));
  });

  it('no log line carries a member or a date', async () => {
    const s = setup(() => members(25));
    await s.run();
    expect(s.lines.length).toBeGreaterThan(0);
    for (const l of s.lines) expect(l).not.toMatch(/member-secret|2026-09/);
  });
});

describe('what the module may do', () => {
  it('never logs, stores or throws a member', () => {
    const src = readFileSync('features/medschools/scrape/run-wait-curves.ts', 'utf8');
    expect(src).not.toMatch(/log\.\w+\([^)]*member/);
    expect(src).not.toMatch(/lib\/ai|fetch\(/);
  });
});

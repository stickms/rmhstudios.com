import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  refund: vi.fn(async () => undefined),
  admitQuestion: vi.fn(),
  statsForBuilder: vi.fn(),
  readPublicSchools: vi.fn(),
}));
vi.mock('../qa/budget.server', () => ({ admitQuestion: m.admitQuestion }));
vi.mock('../stats.server', () => ({ statsForBuilder: m.statsForBuilder }));
vi.mock('./candidates.server', () => ({ readPublicSchools: m.readPublicSchools }));
// The real runner imports the provider (and Prisma); the tests pass their own.
vi.mock('../qa/runner.server', () => ({ aiBuilderRunner: {} }));

import { AppError } from '@/lib/errors/codes';
import { SCHOOLS } from '../../engine/builder/fixtures';
import type { QaRunner } from '../qa/runner.server';
import { buildList } from './build.server';

const REQUEST = 'zzzrequest 5 schools in the Northeast, research-heavy';
const STATS = {
  mcat: { total: 513, year: 2026, month: 4, earlier: [] },
  gpaCumulative: 3.81,
  gpaScience: 3.7,
  homeState: 'NY',
  hours: [{ category: 'RESEARCH' as const, hours: 1200 }],
  missions: ['research' as const],
};
const route = (o: Record<string, unknown> = {}) => ({ intent: 'list', regions: ['northeast'], count: 5, ...o });

function runner(routeOut: unknown, answerOut: unknown) {
  const calls: { route: unknown[][]; answer: unknown[][] } = { route: [], answer: [] };
  const r: QaRunner = {
    route: vi.fn(async (...a: unknown[]) => {
      calls.route.push(a);
      return routeOut;
    }),
    answer: vi.fn(async (...a: unknown[]) => {
      calls.answer.push(a);
      return answerOut;
    }),
  };
  return { runner: r, calls };
}
const build = (r: QaRunner, o: { useStats?: boolean; isAdmin?: boolean } = {}) =>
  buildList({ userId: 'u1', request: REQUEST, useStats: o.useStats ?? true, isAdmin: o.isAdmin }, { runner: r });

let logs: ReturnType<typeof vi.spyOn>[];
beforeEach(() => {
  m.release.mockReset().mockResolvedValue(undefined);
  m.refund.mockReset().mockResolvedValue(undefined);
  m.admitQuestion
    .mockReset()
    .mockResolvedValue({ tier: 'free', remainingToday: 9, dailyCap: 25, release: m.release, refund: m.refund });
  m.statsForBuilder.mockReset().mockResolvedValue(STATS);
  m.readPublicSchools.mockReset().mockResolvedValue(SCHOOLS);
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) =>
    vi.spyOn(console, k).mockImplementation(() => undefined),
  );
});
afterEach(() => vi.restoreAllMocks());

/** Candidate ids in the order `selectCandidates` returns for the Northeast with research: alpha, bravo, charlie, delta. */
const PICKS = {
  picks: [
    { id: 'c1', reason: { text: 'Your MCAT of 513 is below the class median of 520.', cites: ['m1', 'c1f1'] } },
    { id: 'c2', reason: { text: 'Its mean MCAT is 512.', cites: ['c2f1'] } },
    { id: 'c3', reason: { text: 'It has 99 research labs.', cites: ['c3f1'] } },
    { id: 'c4' },
  ],
};

describe('buildList', () => {
  it('labels in code, groups reach, target, likely, then not enough data, and keeps only grounded reasons', async () => {
    const { runner: r } = runner(route(), PICKS);
    const res = await build(r);
    expect(res.status).toBe('partial');
    expect(res.notice).toBe('removed-ungrounded');
    expect(res.usedStats).toBe(true);
    expect(res.schools.map((s) => [s.slug, s.label])).toEqual([
      ['alpha', 'reach'],
      ['bravo', 'target'],
      ['charlie', 'likely'],
      ['delta', 'not-enough-data'],
    ]);
    const alpha = res.schools[0]!;
    expect(alpha.comparisons[0]).toEqual({
      metric: 'MCAT',
      yours: '513',
      theirs: '520',
      stat: 'median',
      band: 'below', // percentile rank 86 vs 97
      mcat: { latest: 513, earlier: [], yoursPct: { rank: 86, printed: '86' }, theirsPct: { rank: 97, printed: '97' } },
    });
    expect(alpha.reason?.cites).toEqual(['m1', 'c1f1']);
    // The MD-PhD program and MSTP are cited figures, never repeated as notes.
    expect(alpha.notes).toEqual(['home-state']);
    expect(alpha.figures.map((f) => f.kind)).toEqual(expect.arrayContaining(['MDPHD_PROGRAM', 'MSTP_T32']));
    expect(alpha.city).toBe('Town');
    // The member's figures come back as data, never as a sentence built on the server.
    expect(res.member[0]).toEqual({
      ref: 'm1',
      kind: 'mcat',
      value: '513',
      year: 2026,
      month: 4,
      category: null,
      missions: [],
      forLabels: { score: 513, earlier: [], percentile: { rank: 86, printed: '86' } },
    });
    expect(JSON.stringify(res.member)).not.toMatch(/Your|"text"/);
    expect(res.schools.find((s) => s.slug === 'charlie')?.reason).toBeNull(); // "99" is in no fact
    expect(res.member.map((x) => x.ref)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
    expect(res.filters.missions).toEqual(['research']);
  });

  it('labels use the latest MCAT weighted by earlier attempts; the model still sees the latest total only', async () => {
    m.statsForBuilder.mockResolvedValue({ ...STATS, mcat: { ...STATS.mcat, earlier: [499] } });
    const { runner: r, calls } = runner(route(), PICKS);
    const res = await build(r);
    // 0.8 x 513 + 0.2 x 499 = 510.2: 510 (rank 79) vs bravo's mean 512 (84) is near; vs alpha's 520 (97) below.
    const bravo = res.schools.find((s) => s.slug === 'bravo')!;
    expect(bravo.comparisons[0]).toMatchObject({ yours: '510', band: 'near', mcat: { latest: 513, earlier: [499] } });
    expect(res.member[0]?.forLabels).toEqual({ score: 510, earlier: [499], percentile: { rank: 79, printed: '79' } });
    const user = String(calls.answer[0]?.[1]);
    expect(user).toContain('Your most recent MCAT total (April 2026): 513');
    expect(user).not.toContain('499');
    expect(user).not.toContain('510');
  });

  it('the model never sets a label: a label in its reply is ignored', async () => {
    const { runner: r } = runner(route(), { picks: [{ id: 'c1', label: 'likely' }] });
    expect((await build(r)).schools[0]?.label).toBe('reach');
  });

  it('what the model sees: the request, public figures, the member’s few figures; never a note, title or id', async () => {
    const { runner: r, calls } = runner(route(), PICKS);
    await build(r);
    const user = String(calls.answer[0]?.[1]);
    expect(user).toContain('zzzrequest');
    expect(user).toContain('Your most recent MCAT total (April 2026): 513');
    expect(user).toContain('Median MCAT, Entered 2026: 520');
    expect(user).not.toMatch(/u1|userId|Two labs|cpbs/);
    expect(calls.answer[0]?.[2]).toBe('u1'); // metering only
  });

  it('without "use my stats" nothing stored is read or sent and every label is not-compared', async () => {
    const { runner: r, calls } = runner(route(), PICKS);
    const res = await build(r, { useStats: false });
    expect(m.statsForBuilder).not.toHaveBeenCalled();
    expect(res.usedStats).toBe(false);
    expect(new Set(res.schools.map((s) => s.label))).toEqual(new Set(['not-compared']));
    expect(String(calls.answer[0]?.[1])).not.toContain('Your');
    // A reason citing a member fact that does not exist is dropped.
    expect(res.schools[0]?.reason).toBeNull();
  });

  it('use my stats with no MCAT or GPA says so and compares nothing', async () => {
    m.statsForBuilder.mockResolvedValue({ ...STATS, mcat: null, gpaCumulative: null });
    const { runner: r } = runner(route(), { picks: [{ id: 'c1' }] });
    const res = await build(r);
    expect(res).toMatchObject({ usedStats: false, statsMissing: true });
    expect(res.schools[0]?.label).toBe('not-compared');
  });

  it('declines a request that is not for a list before the second call', async () => {
    const { runner: r, calls } = runner({ intent: 'other' }, PICKS);
    expect((await build(r)).status).toBe('declined');
    expect(calls.answer).toHaveLength(0);
  });

  it('no school fits: ends before the second call', async () => {
    const { runner: r, calls } = runner(route({ regions: [], states: ['AK'] }), PICKS);
    expect((await build(r)).status).toBe('no-candidates');
    expect(calls.answer).toHaveLength(0);
  });

  it('an unreadable reply refunds the day’s question and is AI_UNAVAILABLE; no valid pick is no-picks', async () => {
    const { runner: r } = runner(route(), 'prose');
    await expect(build(r)).rejects.toBeInstanceOf(AppError);
    expect(m.refund).toHaveBeenCalledTimes(1);
    const { runner: r2 } = runner(route(), { picks: [{ id: 'nope' }] });
    expect((await build(r2)).status).toBe('no-picks');
    expect(m.refund).toHaveBeenCalledTimes(1);
  });

  it('the gates run first: a refusal there makes no model call', async () => {
    m.admitQuestion.mockRejectedValue(new AppError('MEDSCHOOLS_QA_DAILY_CAP'));
    const { runner: r, calls } = runner(route(), PICKS);
    await expect(build(r)).rejects.toBeInstanceOf(AppError);
    expect(calls.route).toHaveLength(0);
  });

  it('passes the admin flag to the gates', async () => {
    const { runner: r } = runner(route(), PICKS);
    await build(r, { isAdmin: true });
    expect(m.admitQuestion.mock.calls[0]?.[2]).toEqual({ isAdmin: true });
  });

  it('logs counts and a status, never the request, a stat or a reason', async () => {
    const { runner: r } = runner(route(), PICKS);
    await build(r);
    const lines = logs.flatMap((s) => s.mock.calls.map((c: unknown[]) => c.map(String).join(' ')));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).not.toMatch(/zzzrequest|513|3\.81|NY|research labs|Your/);
  });

  it('releases the lease when done', async () => {
    const { runner: r } = runner(route(), PICKS);
    await build(r);
    expect(m.release).toHaveBeenCalledTimes(1);
  });
});

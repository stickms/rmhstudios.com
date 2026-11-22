import { describe, expect, it } from 'vitest';
import {
  computeInsights,
  daysBetween,
  percentile,
  weekStartOf,
  type InsightApplication,
  type InsightEvent,
} from '@/lib/rmhladder/insights';

const NOW = new Date('2026-11-20T12:00:00Z');
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

let seq = 0;
function app(over: Partial<InsightApplication> = {}): InsightApplication {
  seq += 1;
  return {
    id: `a${seq}`,
    jobId: `j${seq}`,
    status: 'applied',
    appliedDate: at('2026-10-01'),
    createdAt: at('2026-10-01'),
    referralName: null,
    followUpDate: null,
    company: 'Acme',
    title: 'Analyst',
    source: 'greenhouse',
    programType: 'internship',
    offerState: null,
    ...over,
  };
}
const move = (application: InsightApplication, from: string | null, to: string, day: string): InsightEvent => ({
  applicationId: application.id,
  fromStatus: from,
  toStatus: to,
  createdAt: at(day),
});
const run = (
  applications: InsightApplication[],
  events: InsightEvent[],
  extra: Partial<Parameters<typeof computeInsights>[0]> = {},
) =>
  computeInsights({
    applications,
    events,
    range: 'all',
    quietDays: 21,
    timeZone: 'UTC',
    now: NOW,
    ...extra,
  });
const count = (r: ReturnType<typeof run>, id: string) => r.funnel.find((s) => s.id === id)?.count;

describe('funnel', () => {
  it('counts an application moved applied, interviewing, rejected as having reached interviewing', () => {
    const a = app({
      status: 'rejected',
    });
    const r = run(
      [a],
      [
        move(a, 'planning', 'applied', '2026-10-01'),
        move(a, 'applied', 'interviewing', '2026-10-08'),
        move(a, 'interviewing', 'rejected', '2026-10-20'),
      ],
    );
    expect(count(r, 'applied')).toBe(1);
    expect(count(r, 'responded')).toBe(1);
    expect(count(r, 'interviewing')).toBe(1);
    expect(count(r, 'final_round')).toBe(0);
    expect(r.funnel.find((s) => s.id === 'interviewing')?.conversion).toBe(1);
  });

  it('counts a skipped stage as reached so conversions never exceed 100 percent', () => {
    const a = app({
      status: 'offer',
    });
    const r = run([a], [move(a, 'applied', 'offer', '2026-10-10')]);
    expect(count(r, 'final_round')).toBe(1);
    expect(count(r, 'offer')).toBe(1);
  });

  it('does not count planning applications, and a rejection of one never sent is not a response', () => {
    const planning = app({
      status: 'planning',
      appliedDate: null,
    });
    const unsent = app({
      status: 'rejected',
      appliedDate: null,
    });
    const r = run([planning, unsent], [move(unsent, 'planning', 'rejected', '2026-10-02')]);
    expect(count(r, 'applied')).toBe(0);
    expect(r.applications).toBe(0);
  });

  it('counts a rejection without further moves as a response', () => {
    const a = app({
      status: 'rejected',
    });
    const r = run([a], [move(a, 'applied', 'rejected', '2026-10-05')]);
    expect(count(r, 'responded')).toBe(1);
    expect(count(r, 'interviewing')).toBe(0);
  });

  it('gives a null conversion after an empty step', () => {
    const r = run([app()], []);
    expect(r.funnel.map((s) => s.conversion)).toEqual([null, 0, null, null, null]);
  });

  it('keeps applications out of a range that began after they were sent', () => {
    const old = app({
      appliedDate: at('2025-01-10'),
    });
    const recent = app({
      appliedDate: at('2026-11-01'),
    });
    expect(
      run([old, recent], [], {
        range: '90d',
      }).applications,
    ).toBe(1);
    expect(
      run([old, recent], [], {
        range: '1y',
      }).applications,
    ).toBe(1);
    expect(
      run([old, recent], [], {
        range: 'all',
      }).applications,
    ).toBe(2);
  });
});

describe('first response', () => {
  it('ignores planning and the move into applied, and counts the first move after', () => {
    const a = app({
      status: 'interviewing',
      appliedDate: at('2026-10-01'),
    });
    const r = run(
      [a],
      [
        move(a, null, 'planning', '2026-09-28'),
        move(a, 'planning', 'applied', '2026-10-01'),
        move(a, 'applied', 'networking', '2026-10-04'),
        move(a, 'networking', 'interviewing', '2026-10-09'),
      ],
    );
    expect(r.response.count).toBe(1);
    expect(r.response.medianDays).toBe(3);
  });

  it('matches a hand count: median and 75th percentile of 2, 4, 6, 20 days', () => {
    const apps = [2, 4, 6, 20].map(() =>
      app({
        status: 'rejected',
        appliedDate: at('2026-10-01'),
      }),
    );
    const events = apps.map((a, i) =>
      move(a, 'applied', 'rejected', `2026-10-${String(1 + [2, 4, 6, 20][i]!).padStart(2, '0')}`),
    );
    const r = run(apps, events);
    expect(r.response.medianDays).toBe(5);
    expect(r.response.p75Days).toBe(9.5);
    // 2, 4, 6 land in week 1; 20 days is the third week.
    expect(r.response.buckets).toEqual([3, 0, 1, 0, 0, 0]);
  });

  it('puts long waits in the last bucket and ignores a response dated before the application', () => {
    const slow = app({
      status: 'rejected',
      appliedDate: at('2026-08-01'),
    });
    const backdated = app({
      status: 'rejected',
      appliedDate: at('2026-10-20'),
    });
    const r = run(
      [slow, backdated],
      [move(slow, 'applied', 'rejected', '2026-10-15'), move(backdated, 'applied', 'rejected', '2026-10-10')],
    );
    expect(r.response.count).toBe(1);
    expect(r.response.buckets[5]).toBe(1);
  });

  it('has no times when nothing was answered', () => {
    const r = run([app(), app(), app()], []);
    expect(r.response).toEqual({
      count: 0,
      medianDays: null,
      p75Days: null,
      buckets: [0, 0, 0, 0, 0, 0],
    });
  });
});

describe('percentile', () => {
  it('is null on an empty set and the value itself on one', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([7], 0.75)).toBe(7);
  });
  it('interpolates on small sets regardless of input order', () => {
    expect(percentile([9, 1], 0.5)).toBe(5);
    expect(percentile([3, 1, 2], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 0.75)).toBe(3.25);
  });
});

describe('weeks', () => {
  it('starts on Monday and fills empty weeks', () => {
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09'); // a Sunday
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09');
    const a = app({
      appliedDate: at('2026-10-05'),
    });
    const b = app({
      appliedDate: at('2026-10-21'),
    });
    const r = run([a, b], []);
    expect(r.weeks.map((w) => [w.weekStart, w.applications])).toEqual([
      ['2026-10-05', 1],
      ['2026-10-12', 0],
      ['2026-10-19', 1],
    ]);
  });

  it('counts a response in the week it came, in the member time zone', () => {
    const a = app({
      status: 'rejected',
      appliedDate: at('2026-10-05'),
    });
    // 02:00 UTC on Monday the 12th is still Sunday evening in New York: the previous week.
    const event: InsightEvent = {
      applicationId: a.id,
      fromStatus: 'applied',
      toStatus: 'rejected',
      createdAt: new Date('2026-10-12T02:00:00Z'),
    };
    const ny = run([a], [event], {
      timeZone: 'America/New_York',
    });
    expect(ny.weeks.find((w) => w.responses === 1)?.weekStart).toBe('2026-10-05');
    const utc = run([a], [event]);
    expect(utc.weeks.find((w) => w.responses === 1)?.weekStart).toBe('2026-10-12');
  });

  it('draws at most a year of weeks', () => {
    const a = app({
      appliedDate: at('2024-01-01'),
    });
    const b = app({
      appliedDate: at('2026-11-02'),
    });
    expect(run([a, b], []).weeks).toHaveLength(52);
  });
});

describe('breakdowns', () => {
  const group = (r: ReturnType<typeof run>, dimension: string, value: string) =>
    r.breakdowns.find((b) => b.dimension === dimension)?.groups.find((g) => g.value === value);

  it('suppresses groups under five applications and rates the rest', () => {
    const referred = Array.from(
      {
        length: 5,
      },
      (_, i) =>
        app({
          referralName: 'Sam',
          status: i < 2 ? 'interviewing' : 'applied',
        }),
    );
    const cold = Array.from(
      {
        length: 4,
      },
      () => app(),
    );
    const r = run([...referred, ...cold], []);
    expect(group(r, 'referral', 'referral')).toMatchObject({
      applications: 5,
      suppressed: false,
      responseRate: 0.4,
      interviewRate: 0.4,
      offerRate: 0,
    });
    expect(group(r, 'referral', 'no_referral')).toEqual({
      value: 'no_referral',
      applications: 4,
      suppressed: true,
      responseRate: null,
      interviewRate: null,
      offerRate: null,
    });
  });

  it('applies the boundary at exactly five and treats a blank referral as none', () => {
    const five = Array.from(
      {
        length: 5,
      },
      () =>
        app({
          referralName: '   ',
        }),
    );
    const other = [
      app({
        referralName: 'Kim',
      }),
    ];
    const r = run([...five, ...other], []);
    expect(group(r, 'referral', 'no_referral')?.suppressed).toBe(false);
    expect(group(r, 'referral', 'referral')?.suppressed).toBe(true);
  });

  it('keeps only dimensions with two or more values and shows values as stored', () => {
    const r = run(
      [
        app({
          source: 'greenhouse',
        }),
        app({
          source: 'lever',
        }),
        app({
          source: 'lever',
        }),
      ],
      [],
    );
    expect(r.breakdowns.map((b) => b.dimension)).toEqual(['source']);
    expect(r.breakdowns[0]?.groups.map((g) => g.value)).toEqual(['lever', 'greenhouse']);
  });
});

describe('quiet applications', () => {
  const quiet = (day: string, quietDays = 21, extra: Partial<InsightApplication> = {}) =>
    run(
      [
        app({
          appliedDate: at(day),
          ...extra,
        }),
      ],
      [],
      {
        quietDays,
      },
    ).quiet;

  it('is quiet at exactly the window and not a day before', () => {
    expect(quiet('2026-10-30')).toHaveLength(1); // 21 days before the 20th
    expect(quiet('2026-10-30')[0]?.daysQuiet).toBe(21);
    expect(quiet('2026-10-31')).toHaveLength(0);
  });

  it('follows the chosen window', () => {
    expect(quiet('2026-11-06', 14)).toHaveLength(1);
    expect(quiet('2026-11-07', 14)).toHaveLength(0);
    expect(quiet('2026-10-22', 30)).toHaveLength(0);
    expect(quiet('2026-10-21', 14)).toHaveLength(1);
  });

  it('restarts the silence at a status move other than applied, but not at a note edit', () => {
    const moved = app({
      appliedDate: at('2026-09-01'),
      status: 'applied',
    });
    const back = move(moved, 'networking', 'applied', '2026-11-15');
    const away = move(moved, 'applied', 'networking', '2026-11-10');
    expect(run([moved], [away, back]).quiet).toHaveLength(0);
    const idle = app({
      appliedDate: at('2026-09-01'),
      status: 'applied',
    });
    expect(run([idle], [move(idle, 'planning', 'applied', '2026-11-15')]).quiet).toHaveLength(1);
  });

  it('lists only applied applications, longest quiet first, with the follow-up date', () => {
    const older = app({
      appliedDate: at('2026-09-01'),
      company: 'Older',
      followUpDate: at('2026-12-01'),
    });
    const newer = app({
      appliedDate: at('2026-10-10'),
      company: 'Newer',
    });
    const answered = app({
      appliedDate: at('2026-09-01'),
      status: 'interviewing',
    });
    const r = run([newer, answered, older], []);
    expect(r.quiet.map((q) => q.company)).toEqual(['Older', 'Newer']);
    expect(r.quiet[0]).toMatchObject({
      followUpDate: '2026-12-01',
      appliedDate: '2026-09-01',
    });
  });

  it('is not limited by the range', () => {
    expect(
      run(
        [
          app({
            appliedDate: at('2025-01-01'),
          }),
        ],
        [],
        {
          range: '90d',
        },
      ).quiet,
    ).toHaveLength(1);
  });
});

describe('outcomes', () => {
  it('counts offers, recorded decisions, withdrawn and rejected within the range', () => {
    const accepted = app({
      status: 'offer',
      offerState: 'accepted',
    });
    const declined = app({
      status: 'offer',
      offerState: 'declined',
    });
    const open = app({
      status: 'offer',
    });
    const recordedOnly = app({
      status: 'interviewing',
      offerState: 'open',
    });
    const withdrawn = app({
      status: 'withdrawn',
    });
    const rejected = app({
      status: 'rejected',
    });
    const r = run(
      [accepted, declined, open, recordedOnly, withdrawn, rejected],
      [move(withdrawn, 'applied', 'withdrawn', '2026-10-09'), move(rejected, 'applied', 'rejected', '2026-10-09')],
    );
    expect(r.outcomes).toEqual({
      offers: 4,
      accepted: 1,
      declined: 1,
      withdrawn: 1,
      rejected: 1,
    });
  });
});

describe('daysBetween', () => {
  it('counts calendar days across a month end and a leap day', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-11-02', '2026-10-30')).toBe(-3);
  });
});

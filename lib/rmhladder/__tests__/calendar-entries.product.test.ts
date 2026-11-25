import { describe, expect, it } from 'vitest';
import {
  ladderCalendarEntries,
  ladderDeadlineUid,
  ladderFollowUpUid,
  ladderInterviewUid,
  type LadderCalendarApplication,
} from '@/lib/rmhladder/calendar-entries';

const NY = 'America/New_York';
const FROM = new Date('2026-03-01T00:00:00Z');
const TO = new Date('2026-04-30T00:00:00Z');

let n = 0;
function app(over: Partial<LadderCalendarApplication> = {}, job: Partial<LadderCalendarApplication['job']> = {}) {
  n += 1;
  return {
    id: `app${n}`,
    status: 'applied',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    followUpDate: null,
    interviewDates: [],
    job: {
      id: `job${n}`,
      title: 'Analyst',
      applicationDeadline: null,
      lastSeenAt: new Date('2026-01-01T00:00:00Z'),
      discoveredAt: new Date('2025-12-01T00:00:00Z'),
      company: { name: 'Acme' },
      ...job,
    },
    ...over,
  } satisfies LadderCalendarApplication;
}

describe('ladder calendar entries', () => {
  it('makes a 30 minute interview at its stored instant with a stable UID and the right words', () => {
    const at = new Date('2026-03-10T14:00:00Z');
    const a = app({ interviewDates: [new Date('2026-02-20T14:00:00Z'), at] });
    const [entry] = ladderCalendarEntries([a], NY, FROM, TO);
    expect(entry).toMatchObject({
      uid: `ladder-interview-${a.id}-1`,
      kind: 'interview',
      title: 'Interview: Analyst at Acme',
      allDay: null,
      href: '/rmhladder/pipeline',
    });
    expect(entry!.startsAt).toEqual(at);
    expect(entry!.endsAt.getTime() - at.getTime()).toBe(30 * 60_000);
  });

  it('keeps an interview UID when its date moves, and raises the sequence when the application changes', () => {
    const a = app({ interviewDates: [new Date('2026-03-10T14:00:00Z')] });
    const moved = {
      ...a,
      interviewDates: [new Date('2026-03-12T16:00:00Z')],
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    };
    const [before] = ladderCalendarEntries([a], NY, FROM, TO);
    const [after] = ladderCalendarEntries([moved], NY, FROM, TO);
    expect(after!.uid).toBe(before!.uid);
    expect(after!.startsAt).not.toEqual(before!.startsAt);
    expect(after!.sequence).toBeGreaterThan(before!.sequence);
  });

  it('raises a deadline sequence when the scraper rewrites the job or the member edits their own job', () => {
    const deadlineOf = (a: LadderCalendarApplication) =>
      ladderCalendarEntries([a], NY, FROM, TO).find((e) => e.kind === 'deadline')!;
    const a = app({}, { applicationDeadline: new Date('2026-03-20T12:00:00Z') });
    const base = deadlineOf(a).sequence;
    // A catalogue job: the scraper stores a new deadline in the write that stamps lastSeenAt.
    const scraped = {
      ...a,
      job: {
        ...a.job,
        applicationDeadline: new Date('2026-03-22T12:00:00Z'),
        lastSeenAt: new Date('2026-03-05T00:00:00Z'),
      },
    };
    expect(deadlineOf(scraped).sequence).toBeGreaterThan(base);
    // An own job is never scraped (lastSeenAt null); its edit touches the member's application.
    const own = app({}, { applicationDeadline: new Date('2026-03-20T12:00:00Z'), lastSeenAt: null });
    const edited = {
      ...own,
      updatedAt: new Date('2026-03-06T00:00:00Z'),
      job: { ...own.job, applicationDeadline: new Date('2026-03-25T12:00:00Z') },
    };
    expect(deadlineOf(edited).sequence).toBeGreaterThan(deadlineOf(own).sequence);
  });

  it('numbers an interview by its place in the stored list, even when earlier ones are outside the window', () => {
    const a = app({ interviewDates: [new Date('2025-01-01T10:00:00Z'), new Date('2026-03-10T14:00:00Z')] });
    expect(ladderCalendarEntries([a], NY, FROM, TO).map((e) => e.uid)).toEqual([ladderInterviewUid(a.id, 1)]);
  });

  it('puts a follow-up and a deadline on the day in the member zone, as all-day entries', () => {
    // 02:30 UTC on the 15th is still the evening of the 14th in New York.
    const a = app(
      { followUpDate: new Date('2026-03-15T02:30:00Z') },
      { applicationDeadline: new Date('2026-03-20T12:00:00Z') },
    );
    const entries = ladderCalendarEntries([a], NY, FROM, TO);
    const follow = entries.find((e) => e.kind === 'followup')!;
    const deadline = entries.find((e) => e.kind === 'deadline')!;
    expect(follow).toMatchObject({
      uid: ladderFollowUpUid(a.id),
      allDay: '2026-03-14',
      title: 'Follow up: Analyst at Acme',
    });
    expect(deadline).toMatchObject({
      uid: ladderDeadlineUid(a.job.id),
      allDay: '2026-03-20',
      title: 'Deadline: Analyst at Acme',
    });
    // the same instant is the 15th in UTC: the member's zone decides
    const utc = ladderCalendarEntries([a], 'UTC', FROM, TO).find((e) => e.kind === 'followup')!;
    expect(utc.allDay).toBe('2026-03-15');
  });

  it('keeps all-day entries on the right local day across the spring-forward and fall-back changes', () => {
    // US clocks change on 8 March 2026 (spring) and 1 November 2026 (fall).
    const cases: [string, string][] = [
      ['2026-03-08T04:59:00Z', '2026-03-07'], // 23:59 EST on the 7th
      ['2026-03-08T05:00:00Z', '2026-03-08'], // midnight EST starts the 8th
      ['2026-03-09T03:59:00Z', '2026-03-08'], // 23:59 EDT on the 8th (the day is 23 hours long)
      ['2026-03-09T04:00:00Z', '2026-03-09'],
      ['2026-11-01T03:59:00Z', '2026-10-31'], // 23:59 EDT on the 31st
      ['2026-11-01T04:00:00Z', '2026-11-01'], // midnight EDT; the 1st is 25 hours long
      ['2026-11-02T04:59:00Z', '2026-11-01'], // 23:59 EST on the 1st
      ['2026-11-02T05:00:00Z', '2026-11-02'],
    ];
    const wide = [new Date('2026-02-20T00:00:00Z'), new Date('2026-11-30T00:00:00Z')] as const;
    for (const [iso, day] of cases) {
      const a = app({ followUpDate: new Date(iso) });
      expect(ladderCalendarEntries([a], NY, ...wide)[0]!.allDay, iso).toBe(day);
    }
  });

  it('leaves out rejected and withdrawn applications, and anything outside the window', () => {
    const dates = {
      interviewDates: [new Date('2026-03-10T14:00:00Z')],
      followUpDate: new Date('2026-03-11T12:00:00Z'),
    };
    const kept = [app({ ...dates, status: 'interviewing' }), app({ ...dates, status: 'offer' })];
    const dropped = [app({ ...dates, status: 'rejected' }), app({ ...dates, status: 'withdrawn' })];
    expect(ladderCalendarEntries([...kept, ...dropped], NY, FROM, TO)).toHaveLength(4);
    const outside = app({
      interviewDates: [new Date('2026-08-10T14:00:00Z')],
      followUpDate: new Date('2026-01-11T12:00:00Z'),
    });
    expect(ladderCalendarEntries([outside], NY, FROM, TO)).toEqual([]);
  });

  it('falls back to the default zone when the stored one is unknown', () => {
    const a = app({ followUpDate: new Date('2026-03-15T02:30:00Z') });
    expect(ladderCalendarEntries([a], 'Not/AZone', FROM, TO)[0]!.allDay).toBe('2026-03-14');
    expect(ladderCalendarEntries([a], null, FROM, TO)[0]!.allDay).toBe('2026-03-14');
  });

  it('uses the titles a member gave an own job, trimmed to one line', () => {
    const a = app(
      { interviewDates: [new Date('2026-03-10T14:00:00Z')] },
      { title: ' My\n  own role ', company: { name: 'Side Co' } },
    );
    expect(ladderCalendarEntries([a], NY, FROM, TO)[0]!.title).toBe('Interview: My own role at Side Co');
  });

  it('sorts by time and carries no private field', () => {
    const a = app({ interviewDates: [new Date('2026-03-12T14:00:00Z'), new Date('2026-03-10T14:00:00Z')] });
    const entries = ladderCalendarEntries([a], NY, FROM, TO);
    expect(entries.map((e) => e.startsAt.toISOString())).toEqual([
      '2026-03-10T14:00:00.000Z',
      '2026-03-12T14:00:00.000Z',
    ]);
    expect(Object.keys(entries[0]!).sort()).toEqual([
      'allDay',
      'endsAt',
      'href',
      'kind',
      'sequence',
      'startsAt',
      'title',
      'uid',
    ]);
  });
});

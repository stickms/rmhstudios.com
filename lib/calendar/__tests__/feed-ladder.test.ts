/**
 * The private feed with RMHLadder on it (s13-09): off by default, entries when on, and no private application field
 * in the text a calendar provider stores. Prisma is mocked; the feed is built through `buildFeedForToken`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  prefs: null as null | { calendarInFeed: boolean; timezone: string },
  applications: [] as Row[],
  appWheres: [] as Row[],
  appSelects: [] as Row[],
  invalidated: [] as string[],
}));

vi.mock('@/lib/cached.server', () => ({
  cached: async (_key: string, _ms: number, load: () => Promise<unknown>) => load(),
  invalidateCached: vi.fn(async (key: string) => {
    db.invalidated.push(key);
  }),
}));
// Checked against the schema: sprint 13 selected `job.updatedAt`, a column `LadderJob` does not have.
vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    calendarFeed: {
      findUnique: vi.fn(async () => ({ userId: 'u1', token: 'tok-1', enabled: true })),
    },
    tournamentEntrant: { findMany: vi.fn(async () => []) },
    studyBuddyMatch: { findMany: vi.fn(async () => []) },
    ladderUserPrefs: { findUnique: vi.fn(async () => db.prefs) },
    ladderApplication: {
      findMany: vi.fn(async (args: { where: Row; select: Row }) => {
        db.appWheres.push(args.where);
        db.appSelects.push(args.select);
        return db.applications;
      }),
    },
  }),
}));
vi.mock('@/lib/calendar/my-events.server', () => ({
  myEventInputs: vi.fn(async () => []),
  liveWhere: () => ({}),
}));

import { buildFeedForToken } from '@/lib/calendar/feed.server';
import { invalidateLadderCalendarFeed } from '@/lib/rmhladder/calendar-entries.server';

const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const PRIVATE = ['secret-note-text', 'private@contact.example', 'Referrer Person', '$185,000'];

function application(): Row {
  return {
    id: 'app1',
    status: 'interviewing',
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    followUpDate: days(5),
    interviewDates: [days(3)],
    // fields a careless select would carry; the read must not ask for them, and nothing may print them
    notes: PRIVATE[0],
    contactEmail: PRIVATE[1],
    referralName: PRIVATE[2],
    offer: { basePay: PRIVATE[3] },
    job: {
      id: 'job1',
      title: 'Analyst',
      applicationDeadline: days(9),
      lastSeenAt: new Date('2026-01-01T00:00:00Z'),
      discoveredAt: new Date('2025-12-01T00:00:00Z'),
      company: { name: 'Acme' },
    },
  };
}

beforeEach(() => {
  db.prefs = null;
  db.applications = [application()];
  db.appWheres = [];
  db.appSelects = [];
  db.invalidated = [];
});

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('the private feed and RMHLadder', () => {
  it('has nothing from RMHLadder by default, and does not even read applications', async () => {
    const ics = unfold((await buildFeedForToken('tok-1'))!);
    expect(ics).not.toContain('ladder-');
    expect(ics).not.toContain('RMHLadder');
    expect(db.appWheres).toHaveLength(0);
  });

  it('has nothing from RMHLadder while the setting is off', async () => {
    db.prefs = { calendarInFeed: false, timezone: 'America/New_York' };
    const ics = unfold((await buildFeedForToken('tok-1'))!);
    expect(ics).not.toContain('ladder-');
    expect(db.appWheres).toHaveLength(0);
  });

  it('adds the interview, follow-up and deadline when it is on, under stable UIDs', async () => {
    db.prefs = { calendarInFeed: true, timezone: 'America/New_York' };
    const ics = unfold((await buildFeedForToken('tok-1'))!);
    expect(ics).toContain('UID:ladder-interview-app1-0@rmhstudios.com');
    expect(ics).toContain('UID:ladder-followup-app1@rmhstudios.com');
    expect(ics).toContain('UID:ladder-deadline-job1@rmhstudios.com');
    expect(ics).toContain('SUMMARY:Interview: Analyst at Acme');
    expect(ics).toContain('SUMMARY:Follow up: Analyst at Acme');
    expect(ics).toContain('SUMMARY:Deadline: Analyst at Acme');
    expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}\r\nDTEND;VALUE=DATE:\d{8}/);
    expect(ics).toContain('/rmhladder/pipeline');
    expect(ics).toContain('RMHLadder interviews and deadlines');
    // the read is the member's own, never a closed application
    expect(db.appWheres[0]).toMatchObject({ userId: 'u1', status: { notIn: ['rejected', 'withdrawn'] } });
  });

  it('carries no note, e-mail, referral name or pay, and never selects them', async () => {
    db.prefs = { calendarInFeed: true, timezone: 'America/New_York' };
    const ics = unfold((await buildFeedForToken('tok-1'))!);
    for (const secret of PRIVATE) expect(ics, secret).not.toContain(secret);
    const select = db.appSelects[0] as Record<string, unknown>;
    for (const field of ['notes', 'contactEmail', 'referralName', 'coverLetter', 'offer']) {
      expect(select, field).not.toHaveProperty(field);
    }
    // no DESCRIPTION line on a ladder entry (the calendar-level one names the feed only)
    const events = ics
      .split('BEGIN:VEVENT')
      .slice(1)
      .filter((e) => e.includes('ladder-'));
    expect(events.length).toBe(3);
    for (const e of events) expect(e).not.toContain('DESCRIPTION');
  });

  it('drops the cached feed when the setting changes', async () => {
    await invalidateLadderCalendarFeed('u1');
    expect(db.invalidated).toEqual(['calendar-feed:tok-1']);
  });
});

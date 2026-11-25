/**
 * "Yours" with RMHLadder on it (s13-09): a follow-up or deadline reaches the grid as an all-day occurrence, an
 * interview as a timed one, and nothing when the setting is off. Prisma and the event reads are mocked.
 */
import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ prefs: null as null | { calendarInFeed: boolean; timezone: string } }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    ladderUserPrefs: { findUnique: vi.fn(async () => db.prefs) },
    ladderApplication: {
      findMany: vi.fn(async () => [
        {
          id: 'app1',
          status: 'interviewing',
          updatedAt: new Date('2026-02-01T00:00:00Z'),
          followUpDate: new Date('2026-03-05T17:00:00Z'),
          interviewDates: [new Date('2026-03-04T15:00:00Z')],
          job: {
            id: 'job1',
            title: 'Analyst',
            applicationDeadline: null,
            lastSeenAt: new Date('2026-01-01T00:00:00Z'),
            discoveredAt: new Date('2025-12-01T00:00:00Z'),
            company: { name: 'Acme' },
          },
        },
      ]),
    },
  },
}));
vi.mock('@/lib/calendar/my-events.server', () => ({ myEventInputs: vi.fn(async () => []), liveWhere: () => ({}) }));
vi.mock('@/lib/events/occurrences.server', () => ({ overridesForEvents: vi.fn(async () => new Map()) }));
vi.mock('@/lib/cached.server', () => ({
  cached: async (_k: string, _ms: number, load: () => Promise<unknown>) => load(),
  invalidateCached: vi.fn(),
}));

import { getMyGrid } from '@/lib/schedule/grid.server';

describe('getMyGrid with RMHLadder', () => {
  it('marks follow-ups all-day and interviews timed', async () => {
    db.prefs = { calendarInFeed: true, timezone: 'America/New_York' };
    const grid = await getMyGrid('u1', new Date('2026-03-02T00:00:00Z'), 7);
    const all = grid.byDay.flatMap((b) => b.occurrences);
    const follow = all.find((o) => o.slotId === 'ladder-followup-app1');
    const interview = all.find((o) => o.slotId === 'ladder-interview-app1-0');
    expect(follow?.allDay).toBe(true);
    expect(interview?.allDay).toBeUndefined();
  });

  it('adds nothing when the setting is off', async () => {
    db.prefs = { calendarInFeed: false, timezone: 'America/New_York' };
    const grid = await getMyGrid('u1', new Date('2026-03-02T00:00:00Z'), 7);
    expect(grid.byDay.flatMap((b) => b.occurrences)).toEqual([]);
  });
});

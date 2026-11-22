import { describe, expect, it } from 'vitest';
import { eventToICS } from '@/lib/events-ics';
import {
  CALENDAR_DURATION_MS,
  EXPIRE_AFTER_MS,
  JOIN_OPENS_BEFORE_MS,
  MAX_LEAD_MS,
  MIN_LEAD_MS,
  canJoin,
  checkStart,
  joinOpensAt,
  partyPath,
  partyToIcsEvent,
  relativeStart,
  reminderPhase,
  roomPath,
  selectReminders,
} from '@/lib/rmhtube/parties';
import { scheduleBody, updatePartyBody } from '@/lib/rmhtube/parties-schema';

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0);
const MIN = 60_000;

describe('checkStart (the schedule window)', () => {
  it('accepts exactly 15 minutes ahead and exactly 30 days ahead', () => {
    expect(checkStart(NOW + MIN_LEAD_MS, NOW)).toBe('ok');
    expect(checkStart(NOW + MAX_LEAD_MS, NOW)).toBe('ok');
  });
  it('refuses a time that is too soon or too far', () => {
    expect(checkStart(NOW + MIN_LEAD_MS - 1, NOW)).toBe('too-soon');
    expect(checkStart(NOW - MIN, NOW)).toBe('too-soon');
    expect(checkStart(NOW + MAX_LEAD_MS + 1, NOW)).toBe('too-far');
  });
  it('refuses a time that is not a number', () => {
    expect(checkStart(Number.NaN, NOW)).toBe('invalid');
  });
});

describe('joining', () => {
  it('opens 15 minutes before the start', () => {
    const start = NOW + 60 * MIN;
    expect(joinOpensAt(start)).toBe(start - JOIN_OPENS_BEFORE_MS);
    expect(canJoin(start, start - JOIN_OPENS_BEFORE_MS - 1)).toBe(false);
    expect(canJoin(start, start - JOIN_OPENS_BEFORE_MS)).toBe(true);
    expect(canJoin(start, start + 10 * MIN)).toBe(true);
  });
});

describe('reminder selection', () => {
  const start = NOW + 20 * MIN;
  const going = [
    {
      userId: 'a',
      remindedAt: null,
      startedNotifiedAt: null,
    },
    {
      userId: 'b',
      remindedAt: new Date(NOW),
      startedNotifiedAt: null,
    },
    {
      userId: 'c',
      remindedAt: new Date(NOW),
      startedNotifiedAt: new Date(NOW),
    },
  ];

  it('walks waiting, soon, started, expired', () => {
    expect(reminderPhase(start, start - 16 * MIN)).toBe('waiting');
    expect(reminderPhase(start, start - 15 * MIN)).toBe('soon');
    expect(reminderPhase(start, start)).toBe('started');
    expect(reminderPhase(start, start + EXPIRE_AFTER_MS)).toBe('expired');
  });

  it('sends nothing before the window', () => {
    expect(selectReminders(going, start, start - 16 * MIN)).toEqual({
      soon: [],
      started: [],
    });
  });

  it('owes the 15-minute reminder only to those who have not had it', () => {
    expect(selectReminders(going, start, start - 10 * MIN)).toEqual({
      soon: ['a'],
      started: [],
    });
  });

  it('owes the at-start reminder only to those who have not had it, and never a late 15-minute one', () => {
    expect(selectReminders(going, start, start + MIN)).toEqual({
      soon: [],
      started: ['a', 'b'],
    });
  });

  it('sends nothing once the party is expired', () => {
    expect(selectReminders(going, start, start + EXPIRE_AFTER_MS)).toEqual({
      soon: [],
      started: [],
    });
  });
});

describe('calendar output', () => {
  const party = {
    roomId: 'ABC234',
    name: 'Movie night',
    description: 'Bring snacks, not spoilers',
    scheduledFor: new Date(Date.UTC(2026, 10, 25, 19, 30, 0)),
    updatedAt: new Date(Date.UTC(2026, 10, 23, 12, 0, 0)),
    closedAt: null,
  };

  it('maps a party to an event with a stable id, a two-hour span and a 15-minute alarm', () => {
    const event = partyToIcsEvent(party, 'https://rmhstudios.com', 'Fallback');
    expect(event.id).toBe('rmhtube-party-ABC234');
    expect(event.title).toBe('Movie night');
    expect(new Date(event.endsAt as Date).getTime() - party.scheduledFor.getTime()).toBe(CALENDAR_DURATION_MS);
    expect(event.url).toBe('https://rmhstudios.com/rmhtube/party/ABC234');
    expect(event.alarmMinutes).toBe(15);
  });

  it('renders the right UTC time, the alarm and the escaped description', () => {
    const ics = eventToICS(partyToIcsEvent(party, 'https://rmhstudios.com', 'Fallback'));
    expect(ics).toContain('DTSTART:20261125T193000Z');
    expect(ics).toContain('DTEND:20261125T213000Z');
    expect(ics).toContain('SUMMARY:Movie night');
    expect(ics).toContain('DESCRIPTION:Bring snacks\\, not spoilers');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics).toContain('STATUS:CONFIRMED');
  });

  it('marks a closed party CANCELLED and raises SEQUENCE when the row changes', () => {
    const closed = {
      ...party,
      closedAt: new Date(),
      updatedAt: new Date(party.updatedAt.getTime() + 5000),
    };
    const a = partyToIcsEvent(party, 'https://x.test', 'F');
    const b = partyToIcsEvent(closed, 'https://x.test', 'F');
    expect(eventToICS(b)).toContain('STATUS:CANCELLED');
    expect(b.sequence).toBeGreaterThan(a.sequence as number);
  });

  it('uses the fallback name for an unnamed party', () => {
    expect(
      partyToIcsEvent(
        {
          ...party,
          name: null,
        },
        'https://x.test',
        'Fallback',
      ).title,
    ).toBe('Fallback');
  });
});

describe('relativeStart', () => {
  it('rounds to one unit, in either direction', () => {
    expect(relativeStart(NOW + 30 * MIN, NOW)).toEqual({
      value: 30,
      unit: 'minute',
    });
    expect(relativeStart(NOW + 2 * 60 * MIN, NOW)).toEqual({
      value: 2,
      unit: 'hour',
    });
    expect(relativeStart(NOW + 3 * 24 * 60 * MIN, NOW)).toEqual({
      value: 3,
      unit: 'day',
    });
    expect(relativeStart(NOW - 5 * MIN, NOW)).toEqual({
      value: -5,
      unit: 'minute',
    });
  });
  it('never says 0 minutes', () => {
    expect(relativeStart(NOW + 1000, NOW).value).toBe(1);
  });
});

describe('paths', () => {
  it('builds the party and room paths', () => {
    expect(partyPath('ABC234')).toBe('/rmhtube/party/ABC234');
    expect(roomPath('ABC234')).toBe('/rmhtube/ABC234');
  });
});

describe('request schemas', () => {
  const ok = {
    name: 'Movie night',
    startsAt: '2026-11-25T19:30:00.000Z',
    isPublic: true,
    maxMembers: 20,
  };
  it('accepts a minimal party', () => {
    expect(scheduleBody.safeParse(ok).success).toBe(true);
  });
  it('refuses a password: a password room cannot be scheduled', () => {
    expect(
      scheduleBody.safeParse({
        ...ok,
        password: 'secret',
      }).success,
    ).toBe(false);
  });
  it('bounds the text and the first video', () => {
    expect(
      scheduleBody.safeParse({
        ...ok,
        name: '',
      }).success,
    ).toBe(false);
    expect(
      scheduleBody.safeParse({
        ...ok,
        description: 'x'.repeat(501),
      }).success,
    ).toBe(false);
    expect(
      scheduleBody.safeParse({
        ...ok,
        firstVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }).success,
    ).toBe(true);
    expect(
      scheduleBody.safeParse({
        ...ok,
        firstVideoUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
    expect(
      scheduleBody.safeParse({
        ...ok,
        firstVideoUrl: 'https://example.com/page',
      }).success,
    ).toBe(false);
  });
  it('needs a change to update', () => {
    expect(updatePartyBody.safeParse({}).success).toBe(false);
    expect(
      updatePartyBody.safeParse({
        description: '',
      }).success,
    ).toBe(true);
  });
});

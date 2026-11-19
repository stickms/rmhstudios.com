/**
 * The one Event model's mappings (2026-11-19 consolidation). These guard user
 * data: a wrong mapping moves somebody's game night, drops a booked office
 * hour from their feed, or re-publishes a calendar entry under a new UID so it
 * shows twice in their calendar app.
 */
import { describe, expect, it } from 'vitest';
import { expand } from '@/lib/schedule/slots';
import { gridAnchor, rotation } from '@/lib/competitive/game-night';
import {
  WHOLE_EVENT,
  gameNightDef,
  gameNightEventData,
  gameNightMeta,
  gridOccurrences,
  officeHoursSlotKey,
  recurUntilFromSlotUntil,
  slotRecurrenceOf,
  slotRule,
  slotUntilFromRecurUntil,
  startsBetween,
} from '../event-model';
import { attendanceBetween, feedEntries, type FeedEventRow } from '../feed-entries';
import { occurrencesBetween } from '../recurrence';

const at = (iso: string) => new Date(iso);

const row = (over: Partial<FeedEventRow> = {}): FeedEventRow => ({
  id: 'e1',
  owner: 'USER',
  kind: 'event',
  hostId: 'h',
  pollId: null,
  title: 'Meetup',
  description: '',
  href: null,
  startsAt: at('2026-12-01T18:00:00Z'),
  endsAt: at('2026-12-01T19:00:00Z'),
  venueKind: 'IRL',
  venueRef: 'Park',
  canceledAt: null,
  recurrence: null,
  recurUntil: null,
  recurTz: null,
  community: null,
  ...over,
});

describe('daily recurrence (D)', () => {
  it('steps one day at a time in its timezone', () => {
    const got = occurrencesBetween(
      { rule: 'D', tz: 'UTC', first: at('2026-10-01T00:00:00Z'), until: null },
      at('2026-11-01T00:00:00Z'),
      at('2026-11-03T12:00:00Z'),
    ).map((o) => o.startsAt.toISOString());
    expect(got).toEqual([
      '2026-11-01T00:00:00.000Z',
      '2026-11-02T00:00:00.000Z',
      '2026-11-03T00:00:00.000Z',
    ]);
  });

  it('still expands a series started years ago (the safety rail counts from the window)', () => {
    const got = occurrencesBetween(
      { rule: 'D', tz: 'UTC', first: at('2010-01-01T09:00:00Z'), until: null },
      at('2026-11-01T00:00:00Z'),
      at('2026-11-02T00:00:00Z'),
    );
    expect(got.map((o) => o.startsAt.toISOString())).toEqual(['2026-11-01T09:00:00.000Z']);
  });
});

describe('grid slots copied from scheduled_slot', () => {
  it('maps the repeat words to rules and back', () => {
    expect(slotRule('daily')).toBe('D');
    expect(slotRule('weekly')).toBe('W');
    expect(slotRule('once')).toBeNull();
    expect(slotRecurrenceOf('D')).toBe('daily');
    expect(slotRecurrenceOf('W')).toBe('weekly');
    expect(slotRecurrenceOf(null)).toBe('once');
  });

  it('an instant `until` round-trips through the calendar-date recurUntil', () => {
    const until = at('2026-12-28T12:00:00Z');
    expect(recurUntilFromSlotUntil(until)?.toISOString()).toBe('2026-12-27T12:00:00.001Z');
    expect(slotUntilFromRecurUntil(recurUntilFromSlotUntil(until))?.getTime()).toBe(until.getTime());
  });

  it('expands exactly as the old slot expander did, until included', () => {
    const slot = {
      startsAt: at('2026-10-05T12:00:00Z'),
      until: at('2026-12-28T12:00:00Z'),
    };
    const from = at('2026-12-01T00:00:00Z');
    const to = at('2027-01-31T00:00:00Z');
    const old = expand(
      {
        id: 's',
        kind: 'season',
        title: 'x',
        href: null,
        startsAt: slot.startsAt,
        durationMinutes: 30,
        recurrence: 'weekly',
        until: slot.until,
      },
      from,
      to,
    ).map((o) => o.startsAt.getTime());
    const now = startsBetween(
      {
        startsAt: slot.startsAt,
        recurrence: 'W',
        recurTz: 'UTC',
        recurUntil: recurUntilFromSlotUntil(slot.until),
      },
      from,
      to,
    ).map((d) => d.getTime());
    expect(now).toEqual(old);
    expect(now.at(-1)).toBe(slot.until.getTime());
  });

  it('a member event shows on the grid as a community-event; a moment has no length', () => {
    const occ = gridOccurrences(
      { ...row(), endsAt: null, kind: 'event' },
      '/x',
      at('2026-12-01T00:00:00Z'),
      at('2026-12-02T00:00:00Z'),
    );
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ kind: 'community-event', slotId: 'e1', href: '/x' });
    expect(occ[0]!.endsAt.getTime()).toBe(occ[0]!.startsAt.getTime());
  });
});

describe('game nights copied from game_night', () => {
  it('keeps weekday, start minute and length, from the same grid anchor the migration uses', () => {
    const data = gameNightEventData({
      weekday: 5,
      startMinute: 1200,
      durationMinutes: 120,
      minutesPerGame: 20,
      games: ['rmhbox'],
    });
    // The migration writes 2024-01-07 + weekday days + startMinute minutes.
    expect(data.startsAt.toISOString()).toBe('2024-01-12T20:00:00.000Z');
    expect(data.startsAt.getTime()).toBe(gridAnchor({ weekday: 5, startMinute: 1200 }).getTime());
    const def = gameNightDef({ id: 'g', title: 'Party', ...data });
    expect(def).toMatchObject({ weekday: 5, startMinute: 1200, durationMinutes: 120, minutesPerGame: 20, games: ['rmhbox'] });
    // And the rotation maths reads it as before: Friday 20:30 UTC is live.
    expect(rotation(def, at('2026-11-20T20:30:00Z')).state).toBe('live');
  });

  it('reads junk meta safely', () => {
    expect(gameNightMeta(null)).toEqual({ games: [], minutesPerGame: 30, lobbyCodes: {} });
    expect(gameNightMeta({ games: ['a', 3], minutesPerGame: -1, lobbyCodes: { a: 'X', b: 2 } })).toEqual({
      games: ['a'],
      minutesPerGame: 30,
      lobbyCodes: { a: 'X' },
    });
  });
});

describe('office hours', () => {
  it('keys a slot by host and start, as the migration does', () => {
    expect(officeHoursSlotKey('u1', at('2026-12-02T15:00:00Z'))).toBe('u1:1796223600000');
  });
});

describe('the calendar feed keeps its UIDs', () => {
  const from = at('2026-11-01T00:00:00Z');
  const to = at('2027-01-01T00:00:00Z');
  const whole = (status: string, everyTime = false) => ({ status, occurrenceAt: WHOLE_EVENT, everyTime });

  it('a one-off event: event-<id>, "(maybe)" on a maybe', () => {
    const [e] = feedEntries({ event: row(), answers: [whole('maybe')] }, from, to, 'https://s');
    expect(e).toMatchObject({ id: 'event-e1', title: 'Meetup (maybe)', location: 'IRL: Park' });
  });

  it('a series: event-<id>-<ms> per date; a per-date "no" sits one out', () => {
    const series = row({
      recurrence: 'W',
      recurTz: 'UTC',
      startsAt: at('2026-11-05T20:00:00Z'),
      endsAt: at('2026-11-05T21:00:00Z'),
      recurUntil: at('2026-11-19T00:00:00Z'),
    });
    const entries = feedEntries(
      {
        event: series,
        answers: [whole('going', true), { status: 'no', occurrenceAt: at('2026-11-12T20:00:00Z'), everyTime: false }],
      },
      from,
      to,
      'https://s',
    );
    expect(entries.map((e) => e.id)).toEqual([
      `event-e1-${at('2026-11-05T20:00:00Z').getTime()}`,
      `event-e1-${at('2026-11-19T20:00:00Z').getTime()}`,
    ]);
  });

  it('office hours: office-hours-<id>, titled with the other person, for the host too', () => {
    const oh = row({ id: 'ob1', kind: 'office-hours', description: 'jam' });
    const [e] = feedEntries({ event: oh, answers: [], implicit: 'host', otherName: 'Ada' }, from, to, 'https://s');
    expect(e).toMatchObject({ id: 'office-hours-ob1', title: 'Office hours with Ada', url: 'https://s/office-hours/h' });
  });

  it("a poll's event: poll-<pollId>, also for a respondent without an RSVP", () => {
    const ev = row({ id: 'p2', pollId: 'p2', href: '/when/p2' });
    const [e] = feedEntries({ event: ev, answers: [], implicit: 'poll' }, from, to, 'https://s');
    expect(e).toMatchObject({ id: 'poll-p2', url: 'https://s/when/p2', categories: ['Poll'] });
  });

  it('a platform slot added to the feed: slot-<id>-<ms> for each date', () => {
    const slot = row({
      id: 'ss1',
      owner: 'PLATFORM',
      kind: 'daily-puzzle',
      href: '/daily',
      startsAt: at('2026-10-01T00:00:00Z'),
      endsAt: null,
      recurrence: 'D',
      recurTz: 'UTC',
    });
    const entries = feedEntries(
      { event: slot, answers: [whole('going', true)] },
      at('2026-11-01T00:00:00Z'),
      at('2026-11-02T12:00:00Z'),
      'https://s',
    );
    expect(entries.map((e) => e.id)).toEqual([
      `slot-ss1-${at('2026-11-01T00:00:00Z').getTime()}`,
      `slot-ss1-${at('2026-11-02T00:00:00Z').getTime()}`,
    ]);
    expect(entries[0]).toMatchObject({ url: 'https://s/daily', endsAt: null });
  });

  it('an answer outside the window is not on the calendar', () => {
    expect(attendanceBetween({ event: row(), answers: [whole('going')] }, at('2027-02-01T00:00:00Z'), at('2027-03-01T00:00:00Z'))).toEqual([]);
  });
});

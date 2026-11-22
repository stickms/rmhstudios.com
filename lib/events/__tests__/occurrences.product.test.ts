import { describe, expect, it } from 'vitest';
import { calendarFeedICS } from '@/lib/events-ics';
import { attendanceBetween, feedEntries, type FeedInput } from '@/lib/calendar/feed-entries';
import { occurrencesBetween, type RecurringSeries } from '@/lib/calendar/recurrence';
import { wallTimeOf, wallToUtcMs } from '@/lib/calendar/tz';
import {
  applyOverrides,
  checkOverride,
  occurrenceNotice,
  upcomingDates,
  type OccurrenceOverride,
} from '@/lib/events/occurrences';

const HOUR = 3_600_000;
const NY = 'America/New_York';
// A weekly game night at 20:00 New York time; the US clocks go forward on 14 March 2027.
const first = new Date(
  wallToUtcMs(
    {
      y: 2027,
      mo: 3,
      d: 2,
      h: 20,
      mi: 0,
    },
    NY,
  ),
);
const series: RecurringSeries = {
  rule: 'W',
  tz: NY,
  first,
  until: null,
};
const NOW = new Date('2027-02-20T12:00:00Z');
const dates = (n: number) =>
  occurrencesBetween(series, first, new Date(first.getTime() + 60 * 86_400_000), n).map((o) => ({
    startsAt: o.startsAt,
    endsAt: new Date(o.startsAt.getTime() + 2 * HOUR),
  }));
const wall = (d: Date) => {
  const w = wallTimeOf(d.getTime(), NY);
  return `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')} ${String(w.h).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}`;
};
const move = (at: Date, startsAt: Date, over: Partial<OccurrenceOverride> = {}): OccurrenceOverride => ({
  occurrenceAt: at,
  kind: 'move',
  startsAt,
  endsAt: null,
  note: null,
  ...over,
});
const skip = (at: Date): OccurrenceOverride => ({
  occurrenceAt: at,
  kind: 'skip',
  startsAt: null,
  endsAt: null,
  note: null,
});

describe('applyOverrides', () => {
  it('drops a skipped date, or keeps it marked', () => {
    const [a, b, c] = dates(3);
    const kept = applyOverrides([a!, b!, c!], [skip(b!.startsAt)]);
    expect(kept.map((o) => o.originalAt)).toEqual([a!.startsAt, c!.startsAt]);
    const marked = applyOverrides([a!, b!, c!], [skip(b!.startsAt)], {
      keepSkipped: true,
    });
    expect(marked.map((o) => o.state)).toEqual(['normal', 'skipped', 'normal']);
  });

  it('orders by the effective start after a move, and keeps the original as the key', () => {
    const [a, b, c] = dates(3);
    // c is moved to the day after a (the rule refuses it, but the function itself must still order).
    const out = applyOverrides([a!, b!, c!], [move(c!.startsAt, new Date(a!.startsAt.getTime() + 24 * HOUR))]);
    expect(out.map((o) => o.originalAt)).toEqual([a!.startsAt, c!.startsAt, b!.startsAt]);
    expect(out[1]!.state).toBe('moved');
    expect(out[1]!.startsAt.getTime()).toBe(a!.startsAt.getTime() + 24 * HOUR);
  });

  it('a move keeps the length unless it gives an end, and carries the note', () => {
    const [a] = dates(1);
    const to = new Date(a!.startsAt.getTime() + 2 * 24 * HOUR);
    const [kept] = applyOverrides(
      [a!],
      [
        move(a!.startsAt, to, {
          note: 'Friday instead',
        }),
      ],
    );
    expect(kept!.endsAt!.getTime() - kept!.startsAt.getTime()).toBe(2 * HOUR);
    expect(kept!.note).toBe('Friday instead');
    const end = new Date(to.getTime() + 3 * HOUR);
    const [given] = applyOverrides(
      [a!],
      [
        move(a!.startsAt, to, {
          endsAt: end,
        }),
      ],
    );
    expect(given!.endsAt!.getTime()).toBe(end.getTime());
  });

  it('is linear: a thousand dates and fifty-two overrides', () => {
    const many = Array.from(
      {
        length: 1000,
      },
      (_, i) => ({
        startsAt: new Date(i * 86_400_000),
      }),
    );
    const overrides = Array.from(
      {
        length: 52,
      },
      (_, i) => skip(new Date(i * 7 * 86_400_000)),
    );
    expect(applyOverrides(many, overrides)).toHaveLength(1000 - 52);
  });

  it('holds the wall clock across the daylight-saving change', () => {
    const list = dates(4); // 2, 9, 16 and 23 March; the clocks change on the 14th
    expect(list.map((d) => wall(d.startsAt).slice(11))).toEqual(['20:00', '20:00', '20:00', '20:00']);
    const [, , c, d] = list;
    // 16 March is after the change: 20:00 is 00:00 UTC; before, 01:00 UTC.
    expect(c!.startsAt.getUTCHours()).toBe(0);
    expect(list[0]!.startsAt.getUTCHours()).toBe(1);
    // Moving the 16th to Friday 19:00 New York, a day that is already on daylight time.
    const friday = new Date(
      wallToUtcMs(
        {
          y: 2027,
          mo: 3,
          d: 19,
          h: 19,
          mi: 0,
        },
        NY,
      ),
    );
    const out = applyOverrides([c!, d!], [move(c!.startsAt, friday)]);
    expect(wall(out[0]!.startsAt)).toBe('2027-03-19 19:00');
    expect(out[0]!.endsAt!.getTime() - out[0]!.startsAt.getTime()).toBe(2 * HOUR);
    expect(wall(out[1]!.startsAt)).toBe('2027-03-23 20:00');
  });
});

describe('checkOverride', () => {
  const [a, b, c] = dates(3);
  it('lets a move land between its neighbours and refuses the rest', () => {
    const at = b!.startsAt;
    const ok = (startsAt: Date, endsAt?: Date) =>
      checkOverride(
        series,
        {
          occurrenceAt: at,
          kind: 'move',
          startsAt,
          endsAt,
        },
        NOW,
      );
    expect(ok(new Date(at.getTime() + 24 * HOUR))).toBeNull();
    expect(ok(new Date(at.getTime() - 24 * HOUR))).toBeNull();
    expect(ok(c!.startsAt)).toBe('COLLIDES');
    expect(ok(new Date(c!.startsAt.getTime() + HOUR))).toBe('COLLIDES');
    expect(ok(a!.startsAt)).toBe('COLLIDES');
    expect(ok(new Date(at.getTime() + HOUR), new Date(at.getTime()))).toBe('BAD_END');
    expect(ok(new Date(NOW.getTime() - HOUR))).toBe('MOVE_PAST');
  });

  it('only a real, future occurrence', () => {
    expect(
      checkOverride(
        series,
        {
          occurrenceAt: new Date(a!.startsAt.getTime() + HOUR),
          kind: 'skip',
        },
        NOW,
      ),
    ).toBe('NOT_OCCURRENCE');
    expect(
      checkOverride(
        series,
        {
          occurrenceAt: a!.startsAt,
          kind: 'skip',
        },
        new Date(a!.startsAt.getTime() + 1),
      ),
    ).toBe('PAST');
    expect(
      checkOverride(
        series,
        {
          occurrenceAt: a!.startsAt,
          kind: 'move',
        },
        NOW,
      ),
    ).toBe('MISSING_START');
  });
});

describe('upcomingDates and notices', () => {
  it('lists skipped dates struck, a date moved later than its original, and drops the passed', () => {
    const [a, b] = dates(2);
    const later = new Date(a!.startsAt.getTime() + 3 * 86_400_000);
    const now = new Date(a!.startsAt.getTime() + 24 * HOUR); // the 1st date has passed; its moved date has not
    const list = upcomingDates(series, [move(a!.startsAt, later), skip(b!.startsAt)], {
      now,
      spanMs: 2 * HOUR,
      limit: 3,
    });
    expect(list[0]).toMatchObject({
      occurrenceAt: a!.startsAt.toISOString(),
      state: 'moved',
      startsAt: later.toISOString(),
    });
    expect(list[1]).toMatchObject({
      occurrenceAt: b!.startsAt.toISOString(),
      state: 'skipped',
    });
    expect(list).toHaveLength(3);
  });

  it('writes the notice in the event time zone', () => {
    const at = new Date('2026-12-25T01:00:00Z'); // 24 December, 20:00 in New York
    expect(
      occurrenceNotice({
        title: 'Game night',
        change: 'skip',
        occurrenceAt: at,
        tz: NY,
      }),
    ).toBe('Game night on 24 Dec is skipped');
    expect(
      occurrenceNotice({
        title: 'Game night',
        change: 'restore',
        occurrenceAt: at,
        tz: NY,
      }),
    ).toBe('Game night on 24 Dec is back on');
    const to = new Date('2026-12-27T19:00:00Z'); // Sunday 27 December, 14:00 in New York
    expect(
      occurrenceNotice({
        title: 'Game night',
        change: 'move',
        occurrenceAt: at,
        startsAt: to,
        tz: NY,
      }),
    ).toMatch(/^Game night on 24 Dec moves to \w{3},? 27 Dec,? 14:00$/);
  });
});

describe('the personal calendar feed', () => {
  const [a, b, c] = dates(3);
  const moved = new Date(b!.startsAt.getTime() + 24 * HOUR);
  const input = (over: Partial<FeedInput> = {}): FeedInput => ({
    event: {
      id: 'e1',
      owner: 'USER',
      kind: 'event',
      hostId: 'h',
      pollId: null,
      title: 'Game night',
      description: '',
      href: null,
      startsAt: first,
      endsAt: new Date(first.getTime() + 2 * HOUR),
      venueKind: null,
      venueRef: null,
      canceledAt: null,
      recurrence: 'W',
      recurUntil: null,
      recurTz: NY,
      community: null,
    },
    answers: [
      {
        status: 'going',
        occurrenceAt: new Date(0),
        everyTime: true,
      },
    ],
    overrides: [
      skip(a!.startsAt),
      move(b!.startsAt, moved, {
        note: 'Friday instead',
        updatedAt: new Date('2027-02-21T00:00:00Z'),
      }),
    ],
    ...over,
  });
  const window = [new Date(first.getTime() - 86_400_000), new Date(first.getTime() + 20 * 86_400_000)] as const;

  it('leaves a skipped date out of attendance and puts a moved one where it is now', () => {
    const live = attendanceBetween(input(), window[0], window[1]);
    expect(live.map((d) => d.originalAt.getTime())).toEqual([b!.startsAt.getTime(), c!.startsAt.getTime()]);
    expect(live[0]!.startsAt.getTime()).toBe(moved.getTime());
  });

  it('finds a date moved into the window from an original start outside it', () => {
    const from = new Date(moved.getTime() - HOUR);
    const to = new Date(moved.getTime() + HOUR);
    expect(attendanceBetween(input(), from, to).map((d) => d.startsAt.getTime())).toEqual([moved.getTime()]);
  });

  it('writes EXDATE for a skip and RECURRENCE-ID for a move, under the UID each date always had', () => {
    const ics = calendarFeedICS(feedEntries(input(), window[0], window[1], 'https://rmhstudios.com')).replace(
      /\r\n /g,
      '',
    );
    const stamp = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
    expect(ics).toContain(`EXDATE:${stamp(a!.startsAt)}`);
    expect(ics).toContain(`RECURRENCE-ID:${stamp(b!.startsAt)}`);
    expect(ics).toContain(`UID:event-e1-${b!.startsAt.getTime()}@rmhstudios.com`);
    expect(ics).toContain(`DTSTART:${stamp(moved)}`);
    expect(ics).toContain('DESCRIPTION:Friday instead');
    // The skipped date is cancelled, the untouched one is plain.
    const blocks = ics.split('BEGIN:VEVENT').slice(1);
    expect(blocks.find((x) => x.includes(`EXDATE:${stamp(a!.startsAt)}`))).toContain('STATUS:CANCELLED');
    expect(blocks.find((x) => x.includes(`UID:event-e1-${c!.startsAt.getTime()}@`))).not.toMatch(
      /RECURRENCE-ID|EXDATE/,
    );
    // A subscribing calendar replaces an entry only when SEQUENCE rises: it comes from the change time.
    expect(ics).toContain(`SEQUENCE:${Math.floor(new Date('2027-02-21T00:00:00Z').getTime() / 1000)}`);
  });
});

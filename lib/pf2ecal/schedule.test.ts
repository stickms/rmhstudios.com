/**
 * The recurring rule and the timezone maths behind it.
 *
 * This is in the suite under `docs/testing.md`'s "breaks user data" criterion
 * rather than as gameplay-style coverage: the output of these two modules is
 * written to rows, exported as `.ics`, and synced onto people's phones. A wrong
 * instant here is not a rendering glitch — it is five people arriving an hour
 * apart, and it is invisible until the day it happens, because a schedule that
 * is wrong only after the November DST transition looks perfect in August when
 * it is written.
 *
 * The DST cases are the point. Everything else is a guard on the walk.
 */

import { describe, it, expect } from 'vitest';
import { CAMPAIGN_RULE, describeRule, occurrencesBetween } from './schedule';
import {
  CAMPAIGN_TIME_ZONE,
  REFERENCE_TIME_ZONE,
  getZonedParts,
  isSameZonedDay,
  zonedDateKey,
  zonedDayOfWeek,
  zonedTimeToUtc,
  zoneAbbreviation,
} from './zoned-time';

/** The wall-clock time an instant reads in a zone, as `HH:MM`. */
function clockIn(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

describe('zonedTimeToUtc', () => {
  it('resolves a summer Eastern wall-clock time (EDT, UTC-4)', () => {
    const instant = zonedTimeToUtc({ year: 2026, month: 8, day: 12, hour: 20 }, CAMPAIGN_TIME_ZONE);
    expect(instant.toISOString()).toBe('2026-08-13T00:00:00.000Z');
  });

  it('resolves a winter Eastern wall-clock time (EST, UTC-5)', () => {
    const instant = zonedTimeToUtc(
      { year: 2026, month: 12, day: 16, hour: 20 },
      CAMPAIGN_TIME_ZONE,
    );
    expect(instant.toISOString()).toBe('2026-12-17T01:00:00.000Z');
  });

  it('round-trips through getZonedParts across the DST boundary', () => {
    for (const [month, day] of [
      [8, 12],
      [11, 3],
      [11, 4],
      [12, 16],
      [3, 10],
    ] as const) {
      const instant = zonedTimeToUtc(
        { year: 2026, month, day, hour: 20, minute: 30 },
        CAMPAIGN_TIME_ZONE,
      );
      expect(clockIn(instant, CAMPAIGN_TIME_ZONE)).toBe('20:30');
    }
  });

  it('handles a UTC-ahead zone too (not just the Americas)', () => {
    const instant = zonedTimeToUtc({ year: 2026, month: 8, day: 12, hour: 9 }, 'Asia/Tokyo');
    expect(instant.toISOString()).toBe('2026-08-12T00:00:00.000Z');
  });
});

describe('zoned helpers', () => {
  it('reads the day of week in the target zone, not UTC', () => {
    // 8pm Wednesday Eastern is already Thursday in UTC. The grid buckets by the
    // viewer's zone, so this distinction is what stops a session showing up on
    // the wrong square.
    const instant = new Date('2026-08-13T00:00:00.000Z');
    expect(new Date(instant).getUTCDay()).toBe(4); // Thursday in UTC
    expect(zonedDayOfWeek(instant, CAMPAIGN_TIME_ZONE)).toBe(3); // Wednesday in NY
    expect(zonedDateKey(instant, CAMPAIGN_TIME_ZONE)).toBe('2026-08-12');
  });

  it('detects a session that crosses local midnight', () => {
    const start = new Date('2026-08-13T00:00:00.000Z'); // 8pm Wed ET
    const end = new Date('2026-08-13T04:00:00.000Z'); // midnight ET
    expect(isSameZonedDay(start, end, CAMPAIGN_TIME_ZONE)).toBe(false);
  });

  it('reports the reference zone abbreviation in force at that instant', () => {
    // The parenthetical on every time is generated from this; hardcoding "CDT"
    // would be wrong from 2026-11-01 onward.
    expect(zoneAbbreviation(new Date('2026-08-13T00:00:00Z'), REFERENCE_TIME_ZONE)).toBe('CDT');
    expect(zoneAbbreviation(new Date('2026-12-17T01:00:00Z'), REFERENCE_TIME_ZONE)).toBe('CST');
  });
});

describe('CAMPAIGN_RULE occurrences', () => {
  // The anchor is the first session the table named, not the start of time: the
  // pattern is defined in both directions, so a window opening before 08-12
  // legitimately yields the preceding Friday (08-07). Windows here start at the
  // anchor week so the assertions read as the schedule people were given.
  const from = new Date('2026-08-10T00:00:00Z');
  const to = new Date('2026-10-01T00:00:00Z');

  it('produces the schedule the table described', () => {
    const keys = occurrencesBetween(from, to).map((o) => o.key);
    // Weekly, alternating Wednesday and Friday, from Wed 08/12.
    expect(keys).toEqual([
      '2026-08-12',
      '2026-08-21',
      '2026-08-26',
      '2026-09-04',
      '2026-09-09',
      '2026-09-18',
      '2026-09-23',
    ]);
  });

  it('extends the pattern backwards before the anchor', () => {
    // Opening the window a week earlier picks up the Friday that the same
    // alternating pattern implies, rather than starting abruptly at the anchor.
    const keys = occurrencesBetween(new Date('2026-08-01T00:00:00Z'), to).map((o) => o.key);
    expect(keys[0]).toBe('2026-08-07');
    expect(zonedDayOfWeek(occurrencesBetween(from, to)[0].startsAt, CAMPAIGN_TIME_ZONE)).toBe(3);
  });

  it('alternates Wednesday and Friday, every one of them', () => {
    for (const occurrence of occurrencesBetween(from, to)) {
      const day = zonedDayOfWeek(occurrence.startsAt, CAMPAIGN_TIME_ZONE);
      expect([3, 5]).toContain(day);
    }
  });

  it('is 8pm Eastern on every occurrence, including after the DST change', () => {
    // Through to February so the window straddles 2026-11-01, when the US
    // leaves daylight time. A naive `anchor + n*14 days` would read 19:00 here.
    const long = occurrencesBetween(
      new Date('2026-08-01T00:00:00Z'),
      new Date('2027-02-01T00:00:00Z'),
    );
    expect(long.length).toBeGreaterThan(20);
    for (const occurrence of long) {
      expect(clockIn(occurrence.startsAt, CAMPAIGN_TIME_ZONE)).toBe('20:00');
    }
  });

  it('spans the DST boundary with occurrences on both sides', () => {
    const around = occurrencesBetween(
      new Date('2026-10-20T00:00:00Z'),
      new Date('2026-11-20T00:00:00Z'),
    );
    const offsets = new Set(around.map((o) => o.startsAt.toISOString().slice(11, 16)));
    // Same local hour, two different UTC hours — which is the proof that the
    // rule is anchored to the wall clock rather than to a fixed offset.
    expect(offsets.size).toBe(2);
  });

  it('gives each occurrence the rule duration', () => {
    for (const occurrence of occurrencesBetween(from, to)) {
      expect(occurrence.endsAt.getTime() - occurrence.startsAt.getTime()).toBe(
        CAMPAIGN_RULE.durationMinutes * 60_000,
      );
    }
  });

  it('returns occurrences inside the window, in order', () => {
    const window = occurrencesBetween(
      new Date('2026-08-21T00:00:00Z'),
      new Date('2026-09-06T00:00:00Z'),
    );
    expect(window.map((o) => o.key)).toEqual(['2026-08-21', '2026-08-26', '2026-09-04']);
    for (let i = 1; i < window.length; i++) {
      expect(window[i].startsAt.getTime()).toBeGreaterThan(window[i - 1].startsAt.getTime());
    }
  });

  it('treats the window as half-open: start inclusive, end exclusive', () => {
    // 8pm Eastern on 09-04 is exactly 2026-09-05T00:00Z. Whether that lands in
    // a window ending there decides if a session is materialised twice by two
    // adjacent windows or missed by both, so the boundary is pinned.
    const boundary = new Date('2026-09-05T00:00:00Z');
    const endingAt = occurrencesBetween(new Date('2026-09-01T00:00:00Z'), boundary);
    expect(endingAt.map((o) => o.key)).not.toContain('2026-09-04');

    const startingAt = occurrencesBetween(boundary, new Date('2026-09-08T00:00:00Z'));
    expect(startingAt.map((o) => o.key)).toContain('2026-09-04');
  });

  it('is empty for an inverted or zero-length window', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    expect(occurrencesBetween(now, now)).toEqual([]);
    expect(occurrencesBetween(new Date('2026-09-02T00:00:00Z'), now)).toEqual([]);
  });

  it('walks backwards from the anchor for a window entirely in the past', () => {
    const past = occurrencesBetween(
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-07-01T00:00:00Z'),
    );
    expect(past.length).toBeGreaterThan(0);
    for (const occurrence of past) {
      expect([3, 5]).toContain(zonedDayOfWeek(occurrence.startsAt, CAMPAIGN_TIME_ZONE));
      expect(clockIn(occurrence.startsAt, CAMPAIGN_TIME_ZONE)).toBe('20:00');
    }
  });

  it('generates a stable key that matches the campaign-zone date', () => {
    for (const occurrence of occurrencesBetween(from, to)) {
      expect(occurrence.key).toBe(zonedDateKey(occurrence.startsAt, CAMPAIGN_TIME_ZONE));
      // The key is a VarChar(16) column and the unique idempotency key for
      // materialisation.
      expect(occurrence.key.length).toBeLessThanOrEqual(16);
    }
  });
});

describe('describeRule', () => {
  it('names both weekdays and the campaign hour', () => {
    expect(describeRule()).toBe('Alternating Wednesdays and Fridays at 8pm Eastern');
  });
});

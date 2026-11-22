/**
 * The timezone maths behind every wall-clock schedule on the site (`/dunesday`
 * plans, `/sohumtracker` day buckets). Moved here with the module from
 * `lib/pf2ecal/schedule.test.ts` when that page was deleted.
 *
 * In the suite under `docs/testing.md`'s "breaks user data" criterion: a wrong
 * instant is written to rows and exported as `.ics`, and it is invisible until
 * the day it happens, because a schedule that is wrong only after the November
 * DST transition looks perfect in August when it is written. The DST cases are
 * the point.
 */

import { describe, it, expect } from 'vitest';
import {
  getZonedParts,
  isSameZonedDay,
  zonedDateKey,
  zonedDayOfWeek,
  zonedTimeToUtc,
  zoneAbbreviation,
} from '../zoned-time';

const NEW_YORK = 'America/New_York';
const CHICAGO = 'America/Chicago';

/** The wall-clock time an instant reads in a zone, as `HH:MM`. */
function clockIn(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

describe('zonedTimeToUtc', () => {
  it('resolves a summer Eastern wall-clock time (EDT, UTC-4)', () => {
    const instant = zonedTimeToUtc(
      {
        year: 2026,
        month: 8,
        day: 12,
        hour: 20,
      },
      NEW_YORK,
    );
    expect(instant.toISOString()).toBe('2026-08-13T00:00:00.000Z');
  });

  it('resolves a winter Eastern wall-clock time (EST, UTC-5)', () => {
    const instant = zonedTimeToUtc(
      {
        year: 2026,
        month: 12,
        day: 16,
        hour: 20,
      },
      NEW_YORK,
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
        {
          year: 2026,
          month,
          day,
          hour: 20,
          minute: 30,
        },
        NEW_YORK,
      );
      expect(clockIn(instant, NEW_YORK)).toBe('20:30');
    }
  });

  it('handles a UTC-ahead zone too (not just the Americas)', () => {
    const instant = zonedTimeToUtc(
      {
        year: 2026,
        month: 8,
        day: 12,
        hour: 9,
      },
      'Asia/Tokyo',
    );
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
    expect(zonedDayOfWeek(instant, NEW_YORK)).toBe(3); // Wednesday in NY
    expect(zonedDateKey(instant, NEW_YORK)).toBe('2026-08-12');
  });

  it('detects a session that crosses local midnight', () => {
    const start = new Date('2026-08-13T00:00:00.000Z'); // 8pm Wed ET
    const end = new Date('2026-08-13T04:00:00.000Z'); // midnight ET
    expect(isSameZonedDay(start, end, NEW_YORK)).toBe(false);
  });

  it('reports the reference zone abbreviation in force at that instant', () => {
    // The parenthetical on every time is generated from this; hardcoding "CDT"
    // would be wrong from 2026-11-01 onward.
    expect(zoneAbbreviation(new Date('2026-08-13T00:00:00Z'), CHICAGO)).toBe('CDT');
    expect(zoneAbbreviation(new Date('2026-12-17T01:00:00Z'), CHICAGO)).toBe('CST');
  });
});

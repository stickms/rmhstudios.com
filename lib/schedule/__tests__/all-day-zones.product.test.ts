import { describe, expect, it } from 'vitest';
import { allDayKeyToDayIso, groupByDay, gridDayLabel, regroupByViewerDay, type Occurrence } from '@/lib/schedule/slots';
import { dayOf } from '@/lib/calendar/tz';

/**
 * s15-18 (S13-09): an all-day entry belongs to its calendar day. The grid places it by its day key and names the day
 * from the key, so a viewer at UTC+14 (Pacific/Kiritimati), UTC-12 (Etc/GMT+12) or UTC sees 3 March on 3 March.
 */

const ZONES = ['Pacific/Kiritimati', 'Etc/GMT+12', 'UTC'] as const;
const FROM = new Date('2026-03-01T00:00:00Z');

const interview: Occurrence = {
  slotId: 'ladder-followup-app1',
  kind: 'community-event',
  title: 'Follow up: Analyst at Acme',
  href: null,
  // The noon-UTC bucket instant of 3 March, exactly what `calendar-entries.ts` writes.
  startsAt: new Date('2026-03-03T12:00:00Z'),
  endsAt: new Date('2026-03-04T12:00:00Z'),
  allDay: true,
  allDayKey: '2026-03-03',
};

describe('all-day entries in every zone', () => {
  it('places the entry in the bucket of its day key', () => {
    const buckets = groupByDay([interview], FROM, 7);
    const hit = buckets.filter((b) => b.occurrences.length > 0);
    expect(hit).toHaveLength(1);
    expect(hit[0]!.day.toISOString()).toBe('2026-03-03T00:00:00.000Z');
  });

  it('the key wins over the instant: a key on another UTC day than startsAt is placed by the key', () => {
    const odd: Occurrence = { ...interview, startsAt: new Date('2026-03-04T01:00:00Z'), allDayKey: '2026-03-03' };
    const hit = groupByDay([odd], FROM, 7).filter((b) => b.occurrences.length > 0);
    expect(hit.map((b) => b.day.toISOString())).toEqual(['2026-03-03T00:00:00.000Z']);
  });

  it('a timed entry is still placed by its UTC day', () => {
    const timed: Occurrence = { ...interview, allDay: undefined, allDayKey: undefined };
    delete timed.allDay;
    delete timed.allDayKey;
    const hit = groupByDay([{ ...timed, startsAt: new Date('2026-03-03T23:30:00Z') }], FROM, 7).filter(
      (b) => b.occurrences.length > 0,
    );
    expect(hit.map((b) => b.day.toISOString())).toEqual(['2026-03-03T00:00:00.000Z']);
  });

  it.each(ZONES)('names the day 3 March for a viewer in %s', (zone) => {
    const bucket = groupByDay([interview], FROM, 7).find((b) => b.occurrences.length > 0)!;
    const label = gridDayLabel(bucket.day.toISOString(), 'en-US');
    expect(label).toBe('Tuesday, Mar 3');
    expect(gridDayLabel(allDayKeyToDayIso(interview.allDayKey!), 'en-US')).toBe(label);
    // The label does not depend on where the viewer is: formatting the same bucket in the viewer's zone would.
    const local = bucket.day.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: zone,
    });
    if (zone === 'Etc/GMT+12') expect(local).toBe('Monday, Mar 2');
    if (zone === 'UTC') expect(local).toBe(label);
  });

  it('the day key is what the owner zone saw, whatever the viewer zone', () => {
    // 2026-03-03T23:00Z is 4 March at UTC+14 and 3 March at UTC: the key already settled which.
    const at = new Date('2026-03-03T23:00:00Z').getTime();
    expect(dayOf(at, 'Pacific/Kiritimati')).toBe('2026-03-04');
    expect(dayOf(at, 'UTC')).toBe('2026-03-03');
    expect(dayOf(at, 'Etc/GMT+12')).toBe('2026-03-03');
  });

  it('ignores a malformed key and falls back to the instant', () => {
    const bad: Occurrence = { ...interview, allDayKey: 'March 3' };
    const hit = groupByDay([bad], FROM, 7).filter((b) => b.occurrences.length > 0);
    expect(hit.map((b) => b.day.toISOString())).toEqual(['2026-03-03T00:00:00.000Z']);
  });

  describe('on the page, in the viewer zone', () => {
    const wire = (o: Occurrence) => ({ ...o, startsAt: o.startsAt.toISOString(), endsAt: o.endsAt.toISOString() });
    // 23:00 on 3 March in New York is 04:00 UTC on 4 March: the server's UTC grouping puts it on the 4th.
    const lateTimed = wire({
      slotId: 'late',
      kind: 'community-event',
      title: 'Late game',
      href: null,
      startsAt: new Date('2026-03-04T04:00:00Z'),
      endsAt: new Date('2026-03-04T05:00:00Z'),
    });
    const server = groupByDay(
      [interview, { ...lateTimed, startsAt: new Date(lateTimed.startsAt), endsAt: new Date(lateTimed.endsAt) }],
      FROM,
      7,
    ).map((b) => ({ day: b.day.toISOString(), occurrences: b.occurrences.map(wire) }));
    const titlesByDay = (zone: string) =>
      Object.fromEntries(
        regroupByViewerDay(server, zone)
          .filter((b) => b.occurrences.length > 0)
          .map((b) => [b.day.slice(0, 10), b.occurrences.map((o) => o.slotId)]),
      );

    it('a timed entry sits on the day it starts in the viewer zone; the whole-day entry stays on its key', () => {
      expect(titlesByDay('America/New_York')).toEqual({ '2026-03-03': ['ladder-followup-app1', 'late'] });
      expect(titlesByDay('Pacific/Kiritimati')).toEqual({
        '2026-03-03': ['ladder-followup-app1'],
        '2026-03-04': ['late'],
      });
    });

    it('in UTC (the server render, before hydration) it is exactly the server grouping', () => {
      expect(regroupByViewerDay(server, 'UTC')).toEqual(server);
    });

    it('keeps every quiet day, and gives an entry just before the window its own edge day', () => {
      const early = { ...lateTimed, slotId: 'early', startsAt: '2026-03-01T02:00:00.000Z' };
      const withEarly = server.map((b, i) => (i === 0 ? { ...b, occurrences: [early] } : b));
      const days = regroupByViewerDay(withEarly, 'America/New_York');
      expect(days[0]).toEqual({ day: '2026-02-28T00:00:00.000Z', occurrences: [early] });
      expect(days.slice(1).map((b) => b.day)).toEqual(server.map((b) => b.day));
    });
  });
});

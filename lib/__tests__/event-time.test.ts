import { describe, it, expect } from 'vitest';

import {
  formatInZone,
  googleCalendarUrl,
  icsDownloadPath,
  outlookCalendarUrl,
  shortZoneLabel,
  toCompactUtc,
  zonesDiffer,
} from '@/components/events/event-time';

/**
 * B24 — an event rendered in the organiser's zone with no label is the single
 * most reliable way to make people miss it, so what is tested here is that the
 * zone is real: the same instant formats differently in two zones, the short
 * label names the zone, and the calendar deep links carry UTC instants (not
 * whatever wall clock the machine building the URL happens to be in).
 */

// 2026-08-08T19:00:00Z — mid-summer, so the DST-carrying zones are exercised.
const INSTANT = new Date('2026-08-08T19:00:00.000Z');

describe('formatInZone', () => {
  it('renders the same instant differently in two zones', () => {
    const ny = formatInZone(INSTANT, 'America/New_York', {}, 'en-US');
    const tokyo = formatInZone(INSTANT, 'Asia/Tokyo', {}, 'en-US');
    expect(ny).not.toBe(tokyo);
    // 19:00Z is 3 PM in New York and 4 AM the next day in Tokyo.
    expect(ny).toContain('3:00');
    expect(tokyo).toContain('4:00');
  });

  it('honours an explicit UTC zone', () => {
    expect(formatInZone(INSTANT, 'UTC', { hour: 'numeric', minute: '2-digit' }, 'en-US')).toContain(
      '7:00',
    );
  });
});

describe('shortZoneLabel', () => {
  it('names the zone rather than leaving the reader to guess', () => {
    expect(shortZoneLabel(INSTANT, 'America/New_York', 'en-US')).toBe('EDT');
    expect(shortZoneLabel(INSTANT, 'UTC', 'en-US')).toBe('UTC');
  });

  it('returns an empty string for a zone the runtime does not know', () => {
    expect(shortZoneLabel(INSTANT, 'Not/AZone', 'en-US')).toBe('');
  });
});

describe('zonesDiffer', () => {
  it('is true when the two zones show different clock times', () => {
    expect(zonesDiffer(INSTANT, 'America/New_York', 'Asia/Tokyo')).toBe(true);
  });

  it('is false for the same zone, a missing zone, or two names for one clock', () => {
    expect(zonesDiffer(INSTANT, 'UTC', 'UTC')).toBe(false);
    expect(zonesDiffer(INSTANT, 'UTC', null)).toBe(false);
    expect(zonesDiffer(INSTANT, null, 'Asia/Tokyo')).toBe(false);
    // Same offset, different name — printing a parenthetical here would say the
    // same time twice.
    expect(zonesDiffer(INSTANT, 'Europe/London', 'Europe/Belfast')).toBe(false);
  });
});

describe('calendar links', () => {
  const event = {
    title: 'Launch party',
    description: 'Come along',
    startsAt: '2026-08-08T19:00:00.000Z',
    endsAt: '2026-08-08T21:30:00.000Z',
    location: 'The Studio',
    url: 'https://rmhstudios.com/events',
  };

  it('stamps Google links in compact UTC', () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('dates')).toBe('20260808T190000Z/20260808T213000Z');
    expect(url.searchParams.get('text')).toBe('Launch party');
    expect(url.searchParams.get('location')).toBe('The Studio');
    expect(url.searchParams.get('details')).toContain('https://rmhstudios.com/events');
  });

  it('defaults a missing end time to one hour', () => {
    const url = new URL(googleCalendarUrl({ ...event, endsAt: null }));
    expect(url.searchParams.get('dates')).toBe('20260808T190000Z/20260808T200000Z');
  });

  it('stamps Outlook links in ISO UTC', () => {
    const url = new URL(outlookCalendarUrl(event));
    expect(url.searchParams.get('startdt')).toBe('2026-08-08T19:00:00.000Z');
    expect(url.searchParams.get('enddt')).toBe('2026-08-08T21:30:00.000Z');
    expect(url.searchParams.get('subject')).toBe('Launch party');
    expect(url.searchParams.get('rru')).toBe('addevent');
  });

  it('points .ics at the existing route, id-escaped', () => {
    expect(icsDownloadPath('abc123')).toBe('/api/events/abc123/ics');
    expect(icsDownloadPath('a/b')).toBe('/api/events/a%2Fb/ics');
  });

  it('toCompactUtc drops punctuation and milliseconds', () => {
    expect(toCompactUtc('2026-01-02T03:04:05.678Z')).toBe('20260102T030405Z');
    expect(toCompactUtc(new Date('2026-12-31T23:59:59.000Z'))).toBe('20261231T235959Z');
  });
});

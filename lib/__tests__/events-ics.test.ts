/**
 * `lib/events-ics.ts` — the iCalendar builder shared by `/api/events/:id/ics`
 * and the `/pf2ecal` subscribe feed.
 *
 * In scope for the suite because its output leaves the site: a malformed
 * VCALENDAR is not a rendering bug, it is a calendar app silently refusing to
 * import (or worse, importing an event at the wrong instant onto someone's
 * phone, where nothing on our side will ever tell us). The properties asserted
 * below are the ones a client actually rejects a feed over.
 *
 * The subscription properties are new (`NAME`/`X-WR-CALNAME`,
 * `REFRESH-INTERVAL`, `SEQUENCE`) and exist so a feed can be *followed* rather
 * than imported once — see the module docs.
 */

import { describe, it, expect } from 'vitest';
import { calendarFeedICS, eventToICS, type ICSEvent } from '@/lib/events-ics';

const BASE: ICSEvent = {
  id: 'abc123',
  title: 'Pathfinder 2e session',
  startsAt: new Date('2026-08-13T00:00:00.000Z'),
  endsAt: new Date('2026-08-13T04:00:00.000Z'),
};

/** Unfold a folded calendar back into logical lines (RFC 5545 §3.1). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean);
}

describe('eventToICS', () => {
  it('emits a complete, CRLF-terminated VCALENDAR', () => {
    const ics = eventToICS(BASE);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    // Every line break is CRLF — a bare LF is the single most common reason a
    // client rejects a feed.
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('writes UTC stamps without punctuation', () => {
    const lines = unfold(eventToICS(BASE));
    expect(lines).toContain('DTSTART:20260813T000000Z');
    expect(lines).toContain('DTEND:20260813T040000Z');
  });

  it('escapes TEXT values but not the URL', () => {
    const lines = unfold(
      eventToICS({
        ...BASE,
        title: 'Session; part 2, "the vault"',
        description: 'line one\nline two',
        url: 'https://example.com/a?b=1&c=2',
      }),
    );
    expect(lines).toContain('SUMMARY:Session\\; part 2\\, "the vault"');
    expect(lines).toContain('DESCRIPTION:line one\\nline two');
    // URL is a URI value type, so a comma in a query string must NOT be escaped.
    expect(lines).toContain('URL:https://example.com/a?b=1&c=2');
  });

  it('marks a cancelled event so subscribers drop it', () => {
    const lines = unfold(eventToICS({ ...BASE, canceledAt: new Date() }));
    expect(lines).toContain('STATUS:CANCELLED');
    expect(lines).not.toContain('STATUS:CONFIRMED');
  });

  it('folds long lines at 75 octets without splitting a codepoint', () => {
    const ics = eventToICS({ ...BASE, title: `${'🎲'.repeat(40)} long title` });
    for (const physical of ics.split('\r\n')) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    }
    // …and it still unfolds back to the original text.
    expect(unfold(ics).join('\n')).toContain('🎲'.repeat(40));
  });
});

describe('calendarFeedICS — subscription properties', () => {
  it('carries every event', () => {
    const ics = calendarFeedICS([
      BASE,
      { ...BASE, id: 'def456', startsAt: new Date('2026-08-22T00:00:00.000Z') },
    ]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    const lines = unfold(ics);
    expect(lines).toContain('UID:abc123@rmhstudios.com');
    expect(lines).toContain('UID:def456@rmhstudios.com');
  });

  it('names the calendar for both the standard and the Apple-era property', () => {
    const lines = unfold(calendarFeedICS([BASE], { name: 'Pathfinder 2e' }));
    // Outlook and Google read X-WR-CALNAME; RFC 7986 clients read NAME. A feed
    // that emits only one is listed by its URL in the other.
    expect(lines).toContain('X-WR-CALNAME:Pathfinder 2e');
    expect(lines).toContain('NAME:Pathfinder 2e');
  });

  it('publishes a refresh interval in both dialects', () => {
    const lines = unfold(calendarFeedICS([BASE], { refreshMinutes: 60 }));
    expect(lines).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT60M');
    expect(lines).toContain('X-PUBLISHED-TTL:PT60M');
  });

  it('emits SEQUENCE so a moved event replaces the one already synced', () => {
    const lines = unfold(calendarFeedICS([{ ...BASE, sequence: 42 }]));
    expect(lines).toContain('SEQUENCE:42');
  });

  it('omits SEQUENCE at zero, and never emits a negative or fractional one', () => {
    expect(unfold(calendarFeedICS([BASE]))).not.toContain('SEQUENCE:0');
    expect(unfold(calendarFeedICS([{ ...BASE, sequence: -5 }]))).toContain('SEQUENCE:0');
    expect(unfold(calendarFeedICS([{ ...BASE, sequence: 7.9 }]))).toContain('SEQUENCE:7');
  });

  it('leaves the calendar properties out entirely when not asked for', () => {
    // Guards the existing single-event download path: adding subscription
    // support must not change what `/api/events/:id/ics` emits.
    const ics = calendarFeedICS([BASE]);
    expect(ics).not.toContain('X-WR-CALNAME');
    expect(ics).not.toContain('REFRESH-INTERVAL');
    expect(ics).toBe(eventToICS(BASE));
  });

  it('escapes a calendar name containing TEXT specials', () => {
    const lines = unfold(calendarFeedICS([BASE], { name: 'Table; the "A" team, 2026' }));
    expect(lines).toContain('X-WR-CALNAME:Table\\; the "A" team\\, 2026');
  });
});

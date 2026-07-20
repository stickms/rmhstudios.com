/**
 * Pure iCalendar (RFC 5545) builders for RMHEvents — client-safe (no Prisma,
 * no node:* deps), so the API route and any future client-side "download .ics"
 * affordance can share them.
 *
 * `eventToICS` wraps a single event; `calendarFeedICS` wraps many (a per-user
 * calendar feed). Both emit a full VCALENDAR so the output is importable as-is.
 *
 * Correctness notes:
 * - CRLF line endings throughout (RFC 5545 §3.1).
 * - Content lines are folded at 75 octets with a CRLF + single-space
 *   continuation; folding is byte-aware and never splits a UTF-8 codepoint
 *   (titles/descriptions can contain emoji).
 * - TEXT values (SUMMARY/DESCRIPTION/LOCATION) escape `\ ; ,` and newlines.
 * - Timestamps are emitted in UTC as `YYYYMMDDTHHMMSSZ`.
 */

export interface ICSEvent {
  /** Stable id — used to build the UID. */
  id: string;
  title: string;
  description?: string | null;
  /** Start instant (Date or ISO string). */
  startsAt: Date | string;
  /** End instant (Date or ISO string), if any. */
  endsAt?: Date | string | null;
  /** Human-readable venue/location line (venueRef, URL, community name…). */
  location?: string | null;
  /** Link back to the event / venue. */
  url?: string | null;
  /** When set, the event is exported with STATUS:CANCELLED. */
  canceledAt?: Date | string | null;
}

const PRODID = '-//RMH Studios//RMHEvents//EN';
const UID_DOMAIN = 'rmhstudios.com';

const encoder = new TextEncoder();

/** Escape a TEXT value per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Format a Date/ISO string as a UTC `YYYYMMDDTHHMMSSZ` stamp. */
function toUtcStamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Fold one logical content line into physical lines of at most 75 octets,
 * continuation lines prefixed with a single space. Iterates by codepoint so a
 * multibyte character is never split across the fold boundary.
 */
function foldLine(line: string): string {
  const physical: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    // The first physical line may hold 75 octets; continuation lines reserve one
    // octet for the leading space that is prepended when they are joined.
    const max = physical.length === 0 ? 75 : 74;
    if (currentBytes + chBytes > max) {
      physical.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  physical.push(current);
  return physical.map((l, i) => (i === 0 ? l : ` ${l}`)).join('\r\n');
}

/** Build the unfolded property lines for one VEVENT. */
function veventLines(event: ICSEvent, dtstamp: string): string[] {
  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${event.id}@${UID_DOMAIN}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toUtcStamp(event.startsAt)}`,
  ];
  if (event.endsAt) lines.push(`DTEND:${toUtcStamp(event.endsAt)}`);
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  // URL is a URI value type (not TEXT), so it is not TEXT-escaped.
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push(`STATUS:${event.canceledAt ? 'CANCELLED' : 'CONFIRMED'}`);
  lines.push('END:VEVENT');
  return lines;
}

/** Wrap one or more events in a VCALENDAR envelope, folded, CRLF-terminated. */
function buildCalendar(events: ICSEvent[]): string {
  const dtstamp = toUtcStamp(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const event of events) lines.push(...veventLines(event, dtstamp));
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** A single-event calendar (one VEVENT) — for `GET /api/events/:id/ics`. */
export function eventToICS(event: ICSEvent): string {
  return buildCalendar([event]);
}

/** A multi-event calendar (many VEVENTs) — for a per-user calendar feed. */
export function calendarFeedICS(events: ICSEvent[]): string {
  return buildCalendar(events);
}

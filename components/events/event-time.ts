/**
 * Event time + calendar-link helpers (B24) — pure, no React, no DOM.
 *
 * Split out of `EventTime.tsx` so the two things that are actually easy to get
 * wrong can be tested directly: rendering an instant in a *named* zone, and the
 * UTC stamps in the Google/Outlook deep links. `.ics` is not duplicated here —
 * that is `lib/events-ics.ts`, served by `GET /api/events/$id/ics`.
 */

/** The minimum an add-to-calendar link needs. */
export interface CalendarEventInput {
  title: string;
  description?: string | null;
  /** Start instant — ISO string or Date. */
  startsAt: string | Date;
  /** End instant. Defaults to one hour after the start, as calendars expect. */
  endsAt?: string | Date | null;
  location?: string | null;
  /** Absolute link back to the event, appended to the description. */
  url?: string | null;
}

/** Default event length when an organiser did not give an end time. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** The viewer's IANA zone, or `null` where `Intl` cannot answer. */
export function viewerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * True when two zone names denote genuinely different clocks *for this instant*.
 *
 * A string compare alone would label `Europe/London` vs `Europe/Belfast` a
 * difference and print a parenthetical that says the same time twice. Comparing
 * the formatted instant is the only version of this test that is about what the
 * reader sees.
 */
export function zonesDiffer(instant: Date, a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return false;
  try {
    return formatInZone(instant, a) !== formatInZone(instant, b);
  } catch {
    return false;
  }
}

/** Format an instant in a named zone (`Sat, Aug 8, 7:00 PM` in the site locale). */
export function formatInZone(
  instant: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    ...options,
  }).format(instant);
}

/**
 * The short zone label for an instant (`PDT`, `GMT+2`).
 *
 * This is the whole point of B24: an event time with no zone label is the single
 * most reliable way to make somebody miss it.
 */
export function shortZoneLabel(instant: Date, timeZone: string, locale?: string): string {
  try {
    // `hour` is included on purpose: with `timeZoneName` as the only field some
    // engines emit nothing at all, and the caller only ever reads the zone part.
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: 'numeric',
      timeZoneName: 'short',
    }).formatToParts(instant);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** `YYYYMMDDTHHMMSSZ` — the stamp format Google Calendar's template URL takes. */
export function toCompactUtc(value: string | Date): string {
  return toDate(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function resolvedEnd(event: CalendarEventInput): Date {
  if (event.endsAt) return toDate(event.endsAt);
  return new Date(toDate(event.startsAt).getTime() + DEFAULT_DURATION_MS);
}

function calendarDescription(event: CalendarEventInput): string {
  const parts = [event.description?.trim(), event.url?.trim()].filter(
    (part): part is string => !!part,
  );
  return parts.join('\n\n');
}

/** Google Calendar "add event" template URL. */
export function googleCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toCompactUtc(event.startsAt)}/${toCompactUtc(resolvedEnd(event))}`,
  });
  const details = calendarDescription(event);
  if (details) params.set('details', details);
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook.com "add event" deep link. */
export function outlookCalendarUrl(event: CalendarEventInput): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: toDate(event.startsAt).toISOString(),
    enddt: resolvedEnd(event).toISOString(),
  });
  const details = calendarDescription(event);
  if (details) params.set('body', details);
  if (event.location) params.set('location', event.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** The site's own `.ics` download for an event id. */
export function icsDownloadPath(eventId: string): string {
  return `/api/events/${encodeURIComponent(eventId)}/ics`;
}

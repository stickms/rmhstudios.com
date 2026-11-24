/**
 * The exact time behind a short event date ("21 hours ago", "Nov 19"), for `EventTime`'s tooltip (owner 2026-11-24).
 * Pure and client-safe; the caller passes the viewer's zone (the server never knows it, so this runs after hydration).
 *
 * - An event WITH a time prints in the viewer's local zone, with the zone named: "Tue, Nov 24, 2026, 3:42 PM EST".
 * - A day-only event (a source that gave a date, a tracker milestone, a forecast date) never gets an invented time: the
 *   full calendar date, formatted in UTC so the day never shifts, and the caller adds "No time reported".
 */

/** ADMIT and SDN report some events with a day only; those are stored at exactly 00:00 UTC (the arrivals rule). */
export function isDayOnlyEvent(source: string, occurredAt: string): boolean {
  return (source === 'ADMIT' || source === 'SDN') && occurredAt.slice(10) === 'T00:00:00.000Z';
}

export function exactEventTime(
  iso: string,
  dayOnly: boolean,
  locale: string,
  timeZone?: string | undefined,
): { text: string; dayOnly: boolean } {
  if (dayOnly) {
    const day = iso.slice(0, 10);
    return {
      text: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(
        new Date(`${day}T00:00:00Z`),
      ),
      dayOnly: true,
    };
  }
  // `dateStyle` cannot be combined with `timeZoneName`, so the parts are spelled out (the medium date, a short time).
  return {
    text: new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso)),
    dayOnly: false,
  };
}

/** The tooltip's state: shown or not, and pinned by a press or tap (so the pointer leaving does not hide it). */
export interface EventTipState {
  open: boolean;
  pinned: boolean;
}
export const EVENT_TIP_CLOSED: EventTipState = { open: false, pinned: false };

/**
 * Pure: a mouse hovering or keyboard focus shows it; the mouse leaving hides it unless pinned; a press or tap pins it
 * open, and a second press on a pinned tip hides it; Escape and blur always hide it.
 */
export function nextEventTip(
  s: EventTipState,
  event: 'hover' | 'leave' | 'focus' | 'press' | 'blur' | 'escape',
): EventTipState {
  switch (event) {
    case 'hover':
    case 'focus':
      return s.open ? s : { open: true, pinned: false };
    case 'leave':
      return s.pinned ? s : EVENT_TIP_CLOSED;
    case 'press':
      return s.open && s.pinned ? EVENT_TIP_CLOSED : { open: true, pinned: true };
    case 'blur':
    case 'escape':
      return EVENT_TIP_CLOSED;
  }
}

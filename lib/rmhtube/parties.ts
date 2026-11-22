/**
 * Scheduled RMHTube watch parties — the pure rules (client-safe, no Prisma).
 *
 * A party is an `RmhTubeRoom` row created ahead of time with `scheduledFor` set. This file holds what is
 * decided from numbers alone: the window a start time must fall in, when Join opens, which reminder is due,
 * how a party becomes a calendar event and how its start reads relative to now. The database work is
 * `parties.server.ts`; the strings are the components' (this file returns data, never copy).
 */
import type { ICSEvent } from '@/lib/events-ics';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A party starts at least this far ahead... */
export const MIN_LEAD_MS = 15 * MINUTE;
/** ...and at most this far. */
export const MAX_LEAD_MS = 30 * DAY;
/** Join opens this long before the start. */
export const JOIN_OPENS_BEFORE_MS = 15 * MINUTE;
/** The first reminder goes out this long before the start. */
export const REMINDER_LEAD_MS = 15 * MINUTE;
/** A party nobody opened within this long of its start is closed by the reminder job. */
export const EXPIRE_AFTER_MS = 3 * HOUR;
/** How long a party runs in a calendar (a party has no end time of its own). */
export const CALENDAR_DURATION_MS = 2 * HOUR;
/** Parties one member may have upcoming at once. */
export const MAX_UPCOMING_PER_HOST = 5;
/** Parties one member may schedule in 24 hours. */
export const MAX_SCHEDULED_PER_DAY = 5;
/** The landing's Upcoming section shows public parties this far ahead. */
export const UPCOMING_WINDOW_MS = 7 * DAY;
/** Going avatars the party page shows (and the most it ever reveals about who is going). */
export const GOING_AVATARS = 5;
/** The most parties the landing lists. */
export const UPCOMING_LIMIT = 30;

export type StartCheck = 'ok' | 'too-soon' | 'too-far' | 'invalid';

/** Whether `startMs` falls in the window a party may be scheduled for. */
export function checkStart(startMs: number, nowMs: number): StartCheck {
  if (!Number.isFinite(startMs)) return 'invalid';
  if (startMs < nowMs + MIN_LEAD_MS) return 'too-soon';
  if (startMs > nowMs + MAX_LEAD_MS) return 'too-far';
  return 'ok';
}

/** When Join opens for a party starting at `startMs`. */
export function joinOpensAt(startMs: number): number {
  return startMs - JOIN_OPENS_BEFORE_MS;
}

export function canJoin(startMs: number, nowMs: number): boolean {
  return nowMs >= joinOpensAt(startMs);
}

/** `soon`: the 15-minute reminder is due. `started`: the at-start one is. `expired`: close the room. */
export type ReminderPhase = 'waiting' | 'soon' | 'started' | 'expired';

export function reminderPhase(startMs: number, nowMs: number): ReminderPhase {
  if (nowMs >= startMs + EXPIRE_AFTER_MS) return 'expired';
  if (nowMs >= startMs) return 'started';
  if (nowMs >= startMs - REMINDER_LEAD_MS) return 'soon';
  return 'waiting';
}

export interface RsvpReminderState {
  userId: string;
  remindedAt: Date | null;
  startedNotifiedAt: Date | null;
}

/**
 * Who is owed which reminder right now. The 15-minute one is skipped once the party has started (a late
 * run must not say "starting in 15 minutes" about a party that is under way); the at-start one is sent to
 * everyone going who has not had it. The job still claims each row before sending, so this is a filter,
 * not the guarantee.
 */
export function selectReminders(
  rsvps: readonly RsvpReminderState[],
  startMs: number,
  nowMs: number,
): {
  soon: string[];
  started: string[];
} {
  const phase = reminderPhase(startMs, nowMs);
  if (phase === 'waiting' || phase === 'expired')
    return {
      soon: [],
      started: [],
    };
  if (phase === 'soon') {
    return {
      soon: rsvps.filter((r) => r.remindedAt === null).map((r) => r.userId),
      started: [],
    };
  }
  return {
    soon: [],
    started: rsvps.filter((r) => r.startedNotifiedAt === null).map((r) => r.userId),
  };
}

export const partyPath = (roomId: string): string => `/rmhtube/party/${roomId}`;
export const roomPath = (roomId: string): string => `/rmhtube/${roomId}`;

export interface PartyCalendarInput {
  roomId: string;
  name: string | null;
  description: string | null;
  scheduledFor: Date;
  updatedAt: Date;
  closedAt: Date | null;
}

/** The calendar event for a party: a stable UID, a 15-minute alarm, and CANCELLED once the room is closed. */
export function partyToIcsEvent(party: PartyCalendarInput, origin: string, fallbackName: string): ICSEvent {
  const start = party.scheduledFor.getTime();
  return {
    id: `rmhtube-party-${party.roomId}`,
    title: party.name?.trim() || fallbackName,
    description: party.description,
    startsAt: party.scheduledFor,
    endsAt: new Date(start + CALENDAR_DURATION_MS),
    location: `RMHTube room ${party.roomId}`,
    url: `${origin}${partyPath(party.roomId)}`,
    canceledAt: party.closedAt,
    // A calendar replaces a held copy only when SEQUENCE rises: the row's updatedAt, in seconds, only ever grows.
    sequence: Math.floor(party.updatedAt.getTime() / 1000),
    alarmMinutes: 15,
  };
}

export interface RelativeStart {
  /** The value and unit `Intl.RelativeTimeFormat.format` takes. */
  value: number;
  unit: 'minute' | 'hour' | 'day';
}

/** How far `startMs` is from now, rounded to one unit. Computed when the page renders; nothing ticks. */
export function relativeStart(startMs: number, nowMs: number): RelativeStart {
  const diff = startMs - nowMs;
  const abs = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;
  if (abs < HOUR)
    return {
      value: sign * Math.max(1, Math.round(abs / MINUTE)),
      unit: 'minute',
    };
  if (abs < DAY)
    return {
      value: sign * Math.round(abs / HOUR),
      unit: 'hour',
    };
  return {
    value: sign * Math.round(abs / DAY),
    unit: 'day',
  };
}

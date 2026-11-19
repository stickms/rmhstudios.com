/**
 * The one Event model ("a time, and who's coming"), its pure half. Client-safe.
 *
 * An `Event` row (prisma/schema/events.prisma) is a community or profile
 * event, a platform slot on the programming grid, a weekly game night, a booked
 * office-hours slot or the event a locked-in poll produced. An `Rsvp` row is one
 * person's answer to it. This file holds the mappings every reader shares, so
 * the grid, the calendar feed, the game-night board and the admin routes cannot
 * each grow their own idea of what a row means.
 */
import type { GameNightDef } from '@/lib/competitive/game-night';
import { gridAnchor } from '@/lib/competitive/game-night';
import type { Occurrence, SlotKind } from '@/lib/schedule/slots';
import { isRecurrenceRule, occurrencesBetween, type RecurringSeries } from './recurrence';
import { isValidTimeZone } from './tz';

const MIN = 60_000;
const DAY = 86_400_000;

/**
 * `Rsvp.occurrenceAt` for an answer about the event as a whole: a one-off
 * event, or a standing ("every time") answer to a repeating one. A real
 * occurrence is never at the epoch, and a sentinel (rather than NULL) keeps
 * (eventId, userId, occurrenceAt) a working unique key, which Postgres would
 * not enforce across NULLs.
 */
export const WHOLE_EVENT = new Date(0);

export const isWholeEvent = (at: Date): boolean => at.getTime() === 0;

/** Kinds that are a member's appointment rather than a slot on the public grid. */
export const EVENT_KIND = 'event';
export const OFFICE_HOURS_KIND = 'office-hours';
export const GAME_NIGHT_KIND = 'game-night';

/** The part of an Event row the readers below need. */
export interface EventTimeRow {
  id: string;
  kind: string;
  title: string;
  href: string | null;
  startsAt: Date;
  endsAt: Date | null;
  recurrence: string | null;
  recurUntil: Date | null;
  recurTz: string | null;
}

/** The repeat rule of a row, or null for a one-off. */
export function seriesOf(row: Pick<EventTimeRow, 'startsAt' | 'recurrence' | 'recurUntil' | 'recurTz'>): RecurringSeries | null {
  if (!isRecurrenceRule(row.recurrence)) return null;
  return {
    rule: row.recurrence,
    tz: row.recurTz && isValidTimeZone(row.recurTz) ? row.recurTz : 'UTC',
    first: row.startsAt,
    until: row.recurUntil,
  };
}

export const durationMs = (row: Pick<EventTimeRow, 'startsAt' | 'endsAt'>): number =>
  row.endsAt ? Math.max(0, row.endsAt.getTime() - row.startsAt.getTime()) : 0;

/**
 * Every start of the row inside [from, to]. A one-off has at most one; a
 * repeating row is expanded (bounded by `max`).
 */
export function startsBetween(row: Pick<EventTimeRow, 'startsAt' | 'recurrence' | 'recurUntil' | 'recurTz'>, from: Date, to: Date, max = 120): Date[] {
  const series = seriesOf(row);
  if (!series) {
    const t = row.startsAt.getTime();
    return t >= from.getTime() && t <= to.getTime() ? [row.startsAt] : [];
  }
  return occurrencesBetween(series, from, to, max).map((o) => o.startsAt);
}

/** The grid's kind for a row: a member's event is a 'community-event' there. */
export function gridKind(kind: string): SlotKind {
  return (kind === EVENT_KIND ? 'community-event' : kind) as SlotKind;
}

/** The grid occurrences of one row in a window. `href` is the caller's (it may need the community). */
export function gridOccurrences(row: EventTimeRow, href: string | null, from: Date, to: Date): Occurrence[] {
  const span = durationMs(row);
  return startsBetween(row, from, to).map((startsAt) => ({
    slotId: row.id,
    kind: gridKind(row.kind),
    title: row.title,
    href,
    startsAt,
    endsAt: new Date(startsAt.getTime() + span),
  }));
}

// ── Grid slots (was ScheduledSlot) ──────────────────────────────────────────

/** How the admin route describes a slot's repeat. */
export type SlotRecurrence = 'once' | 'daily' | 'weekly';

export function slotRule(recurrence: SlotRecurrence): 'D' | 'W' | null {
  return recurrence === 'daily' ? 'D' : recurrence === 'weekly' ? 'W' : null;
}

export function slotRecurrenceOf(rule: string | null): SlotRecurrence {
  return rule === 'D' ? 'daily' : rule === 'W' ? 'weekly' : 'once';
}

/**
 * A slot's `until` is an instant (the last start it allows); `recurUntil` is a
 * calendar date that allows starts up to the end of that day. Stored as
 * until - 1 day + 1 ms, the two agree exactly (the migration does the same).
 */
export function recurUntilFromSlotUntil(until: Date | null): Date | null {
  return until ? new Date(until.getTime() - DAY + 1) : null;
}

export function slotUntilFromRecurUntil(recurUntil: Date | null): Date | null {
  return recurUntil ? new Date(recurUntil.getTime() + DAY - 1) : null;
}

// ── Game nights (was GameNight) ─────────────────────────────────────────────

// A type alias, not an interface, so it is assignable to Prisma's JSON input.
export type GameNightMeta = {
  games: string[];
  minutesPerGame: number;
  lobbyCodes: Record<string, string>;
};

/** Read an Event's `meta` as a game-night rotation, tolerating junk. */
export function gameNightMeta(meta: unknown): GameNightMeta {
  const m = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  const games = Array.isArray(m.games) ? m.games.filter((g): g is string => typeof g === 'string') : [];
  const minutesPerGame = typeof m.minutesPerGame === 'number' && m.minutesPerGame > 0 ? m.minutesPerGame : 30;
  const lobbyCodes: Record<string, string> = {};
  if (m.lobbyCodes && typeof m.lobbyCodes === 'object') {
    for (const [k, v] of Object.entries(m.lobbyCodes as Record<string, unknown>)) {
      if (typeof v === 'string') lobbyCodes[k] = v;
    }
  }
  return { games, minutesPerGame, lobbyCodes };
}

/** A game-night Event as the rotation maths in lib/competitive/game-night.ts wants it. */
export function gameNightDef(row: { id: string; title: string; startsAt: Date; endsAt: Date | null; meta: unknown }): GameNightDef {
  const meta = gameNightMeta(row.meta);
  return {
    id: row.id,
    title: row.title,
    weekday: row.startsAt.getUTCDay(),
    startMinute: row.startsAt.getUTCHours() * 60 + row.startsAt.getUTCMinutes(),
    durationMinutes: Math.round(durationMs(row) / MIN),
    minutesPerGame: meta.minutesPerGame,
    games: meta.games,
  };
}

/** The Event columns for a new weekly game night (weekday/startMinute in UTC). */
export function gameNightEventData(input: {
  weekday: number;
  startMinute: number;
  durationMinutes: number;
  minutesPerGame: number;
  games: string[];
}) {
  const startsAt = gridAnchor(input);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + input.durationMinutes * MIN),
    recurrence: 'W',
    recurTz: 'UTC',
    meta: { games: input.games, minutesPerGame: input.minutesPerGame, lobbyCodes: {} } satisfies GameNightMeta,
  };
}

// ── Office hours (was OfficeHoursBooking) ───────────────────────────────────

/** The unique key that makes booking one host's slot race-safe. */
export const officeHoursSlotKey = (hostId: string, startsAt: Date): string => `${hostId}:${startsAt.getTime()}`;

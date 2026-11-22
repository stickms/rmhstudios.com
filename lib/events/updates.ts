/**
 * Event updates (s06-11) — the rules, pure and client-safe. A host, co-host or admin posts a short plain-text
 * note on an event (or one date of a repeating one); the people coming are told once, through a work queue.
 */
import { effectiveAttendance } from '@/lib/calendar/recurrence';

export const UPDATE_MAX = 500;
/** At most this many updates per event inside {@link UPDATE_WINDOW_MS} (rolling), deleted ones included. */
export const UPDATES_PER_WINDOW = 3;
export const UPDATE_WINDOW_MS = 24 * 3_600_000;
/** The author (or an admin) may delete an update for this long; after that the people told keep it. */
export const UPDATE_DELETE_WINDOW_MS = 10 * 60_000;
export const NOTIFY_PREVIEW_MAX = 120;
/** Recipients are read and notified this many at a time. */
export const FANOUT_BATCH = 200;
/** At most this many recipients are read for one update. */
export const MAX_RECIPIENTS = 5000;
/** The calendar description carries at most this many updates, newest first. */
export const ICS_UPDATES_MAX = 3;
export const UPDATES_SHOWN = 50;

export const UPDATE_ENTITY = 'event_update';
export const UPDATE_FANOUT_QUEUE = 'events.update-fanout';

export interface UpdateFanoutJob {
  updateId: string;
}

export type UpdateRefusal = 'NOT_FOUND' | 'FORBIDDEN' | 'CANCELED' | 'RATE_LIMITED' | 'BAD_OCCURRENCE' | 'TOO_LATE';

export interface EventUpdateDTO {
  id: string;
  /** The original start of the date it is about; null: the whole event or series. */
  occurrenceAt: string | null;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; handle: string | null } | null;
  /** The viewer may delete it right now (the author or an admin, inside the delete window). */
  canDelete: boolean;
}

export interface UpdatesRes {
  updates: EventUpdateDTO[];
}

export function updateJobKey(updateId: string): string {
  return `event-update:${updateId}`;
}

/** The update's text for a notification: its first {@link NOTIFY_PREVIEW_MAX} characters, whole code points. */
export function notifyPreview(body: string): string {
  const chars = Array.from(body.trim().replace(/\s+/g, ' '));
  return chars.length <= NOTIFY_PREVIEW_MAX ? chars.join('') : `${chars.slice(0, NOTIFY_PREVIEW_MAX - 1).join('')}…`;
}

/**
 * The rolling limit. `recent` are the creation times of the event's updates (deleted ones too: people were
 * told). Answers when the next one becomes possible, or null when there is room now.
 */
export function nextUpdateAt(recent: readonly Date[], now: Date): Date | null {
  const inWindow = recent
    .map((d) => d.getTime())
    .filter((t) => t > now.getTime() - UPDATE_WINDOW_MS)
    .sort((a, b) => b - a);
  if (inWindow.length < UPDATES_PER_WINDOW) return null;
  // The oldest of the newest N falls out of the window first.
  return new Date(inWindow[UPDATES_PER_WINDOW - 1]! + UPDATE_WINDOW_MS);
}

export function canDeleteUpdate(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < UPDATE_DELETE_WINDOW_MS;
}

export interface AudienceRow {
  userId: string;
  status: string;
  occurrenceAt: Date;
  everyTime: boolean;
}

/**
 * Who an update is for. `target` is the original start of the date it is about, or null for a one-off event or
 * a whole series. Never someone whose answer is `no`.
 *  - one-off event: going, maybe and waitlist answers;
 *  - one date of a series: the attendance for that date (a standing answer, overridden by a per-date one) plus
 *    anyone waitlisted;
 *  - a whole series: anyone with a going, maybe or waitlist answer on any date.
 */
export function audienceOf(rows: readonly AudienceRow[], target: Date | null, recurring: boolean): string[] {
  const waiting = rows.filter((r) => r.status === 'waitlist').map((r) => r.userId);
  if (recurring && target) {
    const standing = rows.filter((r) => r.occurrenceAt.getTime() === 0 && r.everyTime);
    const date = rows.filter((r) => r.occurrenceAt.getTime() === target.getTime());
    return [...new Set([...effectiveAttendance(standing, date).keys(), ...waiting])];
  }
  return [
    ...new Set(
      rows.filter((r) => r.status === 'going' || r.status === 'maybe' || r.status === 'waitlist').map((r) => r.userId),
    ),
  ];
}

/** Drop the author and anyone blocked with the author, in either direction. */
export function withoutAuthorAndBlocked(
  userIds: readonly string[],
  authorId: string,
  blocked: ReadonlySet<string>,
): string[] {
  return userIds.filter((id) => id !== authorId && !blocked.has(id));
}

/**
 * The updates as the lines of a calendar `DESCRIPTION`: the event's own description, then up to three updates
 * newest first. Escaping is the ICS writer's job (`escapeText`); this only shapes and bounds the text.
 */
export function describeWithUpdates(
  base: string | undefined,
  updates: readonly { body: string; createdAt: Date }[],
): string | undefined {
  const lines = [...updates]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, ICS_UPDATES_MAX)
    .map(
      (u) =>
        `Update ${u.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC: ${u.body.trim().slice(0, UPDATE_MAX)}`,
    );
  if (lines.length === 0) return base;
  return [base, lines.join('\n')].filter(Boolean).join('\n\n');
}

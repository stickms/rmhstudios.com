/**
 * K3 — what one member's calendar feed says about the events they are coming
 * to. Pure (lib/calendar/feed.server.ts does the reading), so the mapping from
 * an Event row and the member's Rsvp rows to ICS entries is testable.
 *
 * The UIDs are the ones the feed published before the models merged
 * (`event-…`, `office-hours-…`, `poll-…`, `slot-…-<ms>`), so a subscribed
 * calendar updates its entries in place instead of showing each twice.
 */
import type { ICSEvent } from '@/lib/events-ics';
import { GAME_NIGHT_KIND, OFFICE_HOURS_KIND, durationMs, isWholeEvent, seriesOf, startsBetween } from './event-model';
import { effectiveAttendance } from './recurrence';
import { describeWithUpdates } from '@/lib/events/updates';
import {
  OVERRIDE_MARGIN_MS,
  applyOverrides,
  type OccurrenceOverride,
  type OccurrenceState,
} from '@/lib/events/occurrences';

export interface FeedEventRow {
  id: string;
  owner: string;
  kind: string;
  hostId: string | null;
  pollId: string | null;
  title: string;
  description: string;
  href: string | null;
  startsAt: Date;
  endsAt: Date | null;
  venueKind: string | null;
  venueRef: string | null;
  canceledAt: Date | null;
  recurrence: string | null;
  recurUntil: Date | null;
  recurTz: string | null;
  community: { name: string } | null;
}

export interface FeedAnswer {
  status: string;
  occurrenceAt: Date;
  everyTime: boolean;
}

export interface FeedInput {
  event: FeedEventRow;
  /** The member's own Rsvp rows for this event (any occurrence). */
  answers: FeedAnswer[];
  /**
   * Why the event is in the feed when there is no answer: the member hosts
   * this booking, or answered this event's availability poll.
   */
  implicit?: 'host' | 'poll';
  /** Office hours: the other person's display name. */
  otherName?: string | null;
  /** s06-10 — the skipped and moved dates of a repeating event. */
  overrides?: OccurrenceOverride[];
  /** s06-11 — the event's live updates; the calendar description carries the newest three. */
  updates?: { body: string; createdAt: Date }[];
}

/** One date of the member's attendance. `startsAt` is where it is now; `originalAt` is the answer's key. */
export interface AttendanceDate {
  startsAt: Date;
  status: 'going' | 'maybe';
  originalAt: Date;
  state: OccurrenceState;
  note: string | null;
}

/**
 * The member's attendance at each start of the event inside [from, to]. Answers are keyed by the ORIGINAL
 * start; skipped and moved dates go through `applyOverrides`, so a skipped date is dropped (kept, marked
 * `skipped`, with `includeSkipped`, which the ICS feed uses to say it is gone) and a moved one is where
 * it now is.
 */
export function attendanceBetween(
  input: Pick<FeedInput, 'event' | 'answers' | 'implicit' | 'overrides'>,
  from: Date,
  to: Date,
  opts: { includeSkipped?: boolean } = {},
): AttendanceDate[] {
  const { event, answers } = input;
  const whole = answers.filter((a) => isWholeEvent(a.occurrenceAt));
  if (!seriesOf(event)) {
    if (event.startsAt < from || event.startsAt > to) return [];
    const status = whole[0]?.status ?? (input.implicit ? 'going' : null);
    return status === 'going' || status === 'maybe'
      ? [{ startsAt: event.startsAt, status, originalAt: event.startsAt, state: 'normal', note: null }]
      : [];
  }
  // A repeating event: a standing "every time" answer covers each date, and a
  // per-date answer overrides it ('no' sits that one out).
  const standing = whole.filter((a) => a.everyTime).map((a) => ({ userId: 'me', status: a.status }));
  if (input.implicit && standing.length === 0) standing.push({ userId: 'me', status: 'going' });
  const overrides = input.overrides ?? [];
  // A date moved into the window may start outside it, so expand wider when there is anything to apply.
  const margin = overrides.length > 0 ? OVERRIDE_MARGIN_MS : 0;
  const attending: { startsAt: Date; status: 'going' | 'maybe' }[] = [];
  for (const startsAt of startsBetween(event, new Date(from.getTime() - margin), new Date(to.getTime() + margin))) {
    const att = effectiveAttendance(
      standing,
      answers
        .filter((a) => a.occurrenceAt.getTime() === startsAt.getTime())
        .map((a) => ({ userId: 'me', status: a.status })),
    );
    const status = att.get('me');
    if (status) attending.push({ startsAt, status });
  }
  const statusAt = new Map(attending.map((a) => [a.startsAt.getTime(), a.status]));
  return applyOverrides(attending, overrides, { keepSkipped: opts.includeSkipped })
    .filter((o) => o.state === 'skipped' || (o.startsAt >= from && o.startsAt <= to))
    .filter((o) => o.state !== 'skipped' || (o.originalAt >= from && o.originalAt <= to))
    .map((o) => ({
      startsAt: o.startsAt,
      status: statusAt.get(o.originalAt.getTime()) ?? o.status,
      originalAt: o.originalAt,
      state: o.state,
      note: o.note,
    }));
}

function location(e: FeedEventRow): string | null {
  if (e.venueKind === 'URL') return e.venueRef;
  if (e.venueKind && e.venueRef) return `${e.venueKind}: ${e.venueRef}`;
  return e.community?.name ?? null;
}

/** The `SEQUENCE` of an overridden date: a subscribing calendar only replaces an entry it holds when this rises. */
function sequenceOf(input: FeedInput, originalAt: Date): number | undefined {
  const o = input.overrides?.find((x) => x.occurrenceAt.getTime() === originalAt.getTime());
  return o?.updatedAt ? Math.floor(o.updatedAt.getTime() / 1000) : undefined;
}

/**
 * ICS entries for one event in the member's feed. `site` is the absolute origin. A moved date keeps the
 * UID it had and carries `RECURRENCE-ID`; a skipped one stays in the feed as cancelled with `EXDATE`, so a
 * calendar that already holds it drops it instead of keeping a date nobody shows up to.
 */
export function feedEntries(input: FeedInput, from: Date, to: Date, site: string): ICSEvent[] {
  const e = input.event;
  const span = durationMs(e);
  const endOf = (startsAt: Date) => (span > 0 ? new Date(startsAt.getTime() + span) : null);
  const dates = attendanceBetween(input, from, to, { includeSkipped: true });
  const stamp = (d: AttendanceDate): Partial<ICSEvent> =>
    d.state === 'normal'
      ? {}
      : {
          recurrenceId: d.originalAt,
          ...(d.state === 'skipped' ? { exdates: [d.originalAt], canceledAt: new Date(d.originalAt) } : {}),
          sequence: sequenceOf(input, d.originalAt),
        };
  const noteOf = (d: AttendanceDate, base: string | undefined) =>
    d.note ? [base, d.note].filter(Boolean).join('\n\n') : base;

  if (e.kind === OFFICE_HOURS_KIND) {
    return dates.map((d) => ({
      id: `office-hours-${e.id}`,
      title: `Office hours with ${input.otherName ?? 'a member'}`,
      description: noteOf(d, e.description || undefined),
      startsAt: d.startsAt,
      endsAt: endOf(d.startsAt),
      url: `${site}/office-hours/${e.hostId ?? ''}`,
      canceledAt: e.canceledAt,
      categories: ['Office hours'],
      alarmMinutes: 15,
      ...stamp(d),
    }));
  }

  if (e.owner === 'PLATFORM') {
    return dates.map((d) => ({
      id: `slot-${e.id}-${d.originalAt.getTime()}`,
      title: e.title,
      description: noteOf(d, undefined),
      startsAt: d.startsAt,
      endsAt: endOf(d.startsAt),
      url: `${site}${e.href ?? '/calendar'}`,
      canceledAt: e.canceledAt,
      categories: [e.kind === GAME_NIGHT_KIND ? 'Game night' : 'Schedule'],
      alarmMinutes: 10,
      ...stamp(d),
    }));
  }

  const repeating = !!seriesOf(e);
  return dates.map((d) => ({
    id: e.pollId ? `poll-${e.pollId}` : `event-${e.id}${repeating ? `-${d.originalAt.getTime()}` : ''}`,
    title: d.status === 'maybe' ? `${e.title} (maybe)` : e.title,
    description: describeWithUpdates(noteOf(d, e.description || undefined), input.updates ?? []),
    startsAt: d.startsAt,
    endsAt: endOf(d.startsAt),
    location: location(e),
    url: e.pollId ? `${site}/when/${e.pollId}` : `${site}/calendar`,
    canceledAt: e.canceledAt,
    categories: [e.pollId ? 'Poll' : 'Event'],
    ...stamp(d),
  }));
}

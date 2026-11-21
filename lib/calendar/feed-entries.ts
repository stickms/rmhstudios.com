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
}

/** The member's attendance at each start of the event inside [from, to]. */
export function attendanceBetween(
  input: Pick<FeedInput, 'event' | 'answers' | 'implicit'>,
  from: Date,
  to: Date,
): { startsAt: Date; status: 'going' | 'maybe' }[] {
  const { event, answers } = input;
  const out: { startsAt: Date; status: 'going' | 'maybe' }[] = [];
  const whole = answers.filter((a) => isWholeEvent(a.occurrenceAt));
  if (!seriesOf(event)) {
    if (event.startsAt < from || event.startsAt > to) return out;
    const status = whole[0]?.status ?? (input.implicit ? 'going' : null);
    if (status === 'going' || status === 'maybe') out.push({ startsAt: event.startsAt, status });
    return out;
  }
  // A repeating event: a standing "every time" answer covers each date, and a
  // per-date answer overrides it ('no' sits that one out).
  const standing = whole.filter((a) => a.everyTime).map((a) => ({ userId: 'me', status: a.status }));
  if (input.implicit && standing.length === 0) standing.push({ userId: 'me', status: 'going' });
  for (const startsAt of startsBetween(event, from, to)) {
    const att = effectiveAttendance(
      standing,
      answers
        .filter((a) => a.occurrenceAt.getTime() === startsAt.getTime())
        .map((a) => ({ userId: 'me', status: a.status })),
    );
    const status = att.get('me');
    if (status) out.push({ startsAt, status });
  }
  return out;
}

function location(e: FeedEventRow): string | null {
  if (e.venueKind === 'URL') return e.venueRef;
  if (e.venueKind && e.venueRef) return `${e.venueKind}: ${e.venueRef}`;
  return e.community?.name ?? null;
}

/** ICS entries for one event in the member's feed. `site` is the absolute origin. */
export function feedEntries(input: FeedInput, from: Date, to: Date, site: string): ICSEvent[] {
  const e = input.event;
  const span = durationMs(e);
  const endOf = (startsAt: Date) => (span > 0 ? new Date(startsAt.getTime() + span) : null);
  const dates = attendanceBetween(input, from, to);

  if (e.kind === OFFICE_HOURS_KIND) {
    return dates.map(({ startsAt }) => ({
      id: `office-hours-${e.id}`,
      title: `Office hours with ${input.otherName ?? 'a member'}`,
      description: e.description || undefined,
      startsAt,
      endsAt: endOf(startsAt),
      url: `${site}/office-hours/${e.hostId ?? ''}`,
      canceledAt: e.canceledAt,
      categories: ['Office hours'],
      alarmMinutes: 15,
    }));
  }

  if (e.owner === 'PLATFORM') {
    return dates.map(({ startsAt }) => ({
      id: `slot-${e.id}-${startsAt.getTime()}`,
      title: e.title,
      startsAt,
      endsAt: endOf(startsAt),
      url: `${site}${e.href ?? '/calendar'}`,
      canceledAt: e.canceledAt,
      categories: [e.kind === GAME_NIGHT_KIND ? 'Game night' : 'Schedule'],
      alarmMinutes: 10,
    }));
  }

  const repeating = !!seriesOf(e);
  return dates.map(({ startsAt, status }) => ({
    id: e.pollId ? `poll-${e.pollId}` : `event-${e.id}${repeating ? `-${startsAt.getTime()}` : ''}`,
    title: status === 'maybe' ? `${e.title} (maybe)` : e.title,
    description: e.description || undefined,
    startsAt,
    endsAt: endOf(startsAt),
    location: location(e),
    url: e.pollId ? `${site}/when/${e.pollId}` : `${site}/calendar`,
    canceledAt: e.canceledAt,
    categories: [e.pollId ? 'Poll' : 'Event'],
  }));
}

/**
 * The five activity webhook events (sprint 08 12): a member's own builds, event
 * answers, reading and tournament matches. Pure and client-safe: the catalog
 * (`events.ts`) spreads the definitions in, the emitter builds the payloads.
 *
 * Privacy contract: a payload is built by picking exactly the keys listed in
 * `ACTIVITY_PAYLOAD_KEYS`, so it can never carry another member's id, handle or
 * text, a highlight's text or note, or an opponent. A test fails if a key is added.
 */

export type ActivityEventGroup = 'builds' | 'events' | 'reading' | 'tournaments';

export interface ActivityEventDef {
  name: string;
  description: string;
  group: ActivityEventGroup;
}

export const BUILD_RELEASED_EVENT = 'build.released';
export const EVENT_RSVP_CHANGED_EVENT = 'event.rsvp_changed';
export const READING_FINISHED_EVENT = 'reading.finished';
export const HIGHLIGHT_CREATED_EVENT = 'highlight.created';
export const MATCH_SETTLED_EVENT = 'tournament.match_settled';

export const ACTIVITY_EVENTS: ActivityEventDef[] = [
  {
    name: BUILD_RELEASED_EVENT,
    description:
      'You published a release of one of your builds. The payload carries the build slug, the version, the title and the release time.',
    group: 'builds',
  },
  {
    name: EVENT_RSVP_CHANGED_EVENT,
    description:
      'You changed your own answer to an event. The payload carries the event, the date for a repeating event and your answer, never other guests.',
    group: 'events',
  },
  {
    name: READING_FINISHED_EVENT,
    description: 'You finished a book (shelved it as read for the first time).',
    group: 'reading',
  },
  {
    name: HIGHLIGHT_CREATED_EVENT,
    description:
      'You saved a highlight. The payload names the document and the highlight, never the highlighted text or your note.',
    group: 'reading',
  },
  {
    name: MATCH_SETTLED_EVENT,
    description: 'A tournament match you played was settled. You get won or lost, never your opponent.',
    group: 'tournaments',
  },
];

/** Exactly the keys each payload may carry. */
export const ACTIVITY_PAYLOAD_KEYS = {
  [BUILD_RELEASED_EVENT]: ['buildSlug', 'version', 'title', 'releasedAt'],
  [EVENT_RSVP_CHANGED_EVENT]: ['eventId', 'occurrenceAt', 'status'],
  [READING_FINISHED_EVENT]: ['docKind', 'docKey', 'title', 'finishedAt'],
  [HIGHLIGHT_CREATED_EVENT]: ['highlightId', 'docKind', 'docKey', 'createdAt'],
  [MATCH_SETTLED_EVENT]: ['tournamentId', 'matchId', 'round', 'result', 'settledAt'],
} as const;

export type RsvpPayloadStatus = 'going' | 'maybe' | 'not_going' | 'waitlisted';

/** Map the site's RSVP vocabulary onto the payload's. */
export function rsvpPayloadStatus(status: 'going' | 'maybe' | 'waitlist' | 'none'): RsvpPayloadStatus {
  if (status === 'waitlist') return 'waitlisted';
  if (status === 'none') return 'not_going';
  return status;
}

const iso = (d: Date) => d.toISOString();

export function buildReleaseData(input: { buildSlug: string; version: string; title: string; releasedAt: Date }) {
  return {
    buildSlug: input.buildSlug,
    version: input.version,
    title: input.title,
    releasedAt: iso(input.releasedAt),
  };
}

export function buildRsvpData(input: {
  eventId: string;
  occurrenceAt?: Date | null | undefined;
  status: RsvpPayloadStatus;
}) {
  return {
    eventId: input.eventId,
    occurrenceAt: input.occurrenceAt ? iso(input.occurrenceAt) : null,
    status: input.status,
  };
}

export function buildReadingFinishedData(input: { docKind: string; docKey: string; title: string; finishedAt: Date }) {
  return {
    docKind: input.docKind,
    docKey: input.docKey,
    title: input.title,
    finishedAt: iso(input.finishedAt),
  };
}

export function buildHighlightCreatedData(input: {
  highlightId: string;
  docKind: string;
  docKey: string;
  createdAt: Date;
}) {
  return {
    highlightId: input.highlightId,
    docKind: input.docKind,
    docKey: input.docKey,
    createdAt: iso(input.createdAt),
  };
}

export function buildMatchSettledData(input: {
  tournamentId: string;
  matchId: string;
  round: number;
  result: 'won' | 'lost';
  settledAt: Date;
}) {
  return {
    tournamentId: input.tournamentId,
    matchId: input.matchId,
    round: input.round,
    result: input.result,
    settledAt: iso(input.settledAt),
  };
}

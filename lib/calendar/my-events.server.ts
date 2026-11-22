/**
 * The events on one member's calendar, in a window. Server-only.
 *
 * Read by the personal ICS feed (feed.server.ts) and the "Yours" half of
 * /calendar (lib/schedule/grid.server.ts), so both list the same things:
 *
 *   - every Event the member has an Rsvp for — community and profile events,
 *     office hours they booked, the events their polls locked in, the platform
 *     slots and game nights they added;
 *   - office hours booked WITH them (the guest holds the Rsvp);
 *   - the event of a locked-in poll they answered.
 *
 * `feed-entries.ts` (`attendanceBetween`, `feedEntries`) turns each into dates.
 */
import { prisma } from '@/lib/prisma.server';
import { OFFICE_HOURS_KIND, WHOLE_EVENT } from './event-model';
import type { FeedAnswer, FeedInput } from './feed-entries';
import { loadPeople } from './people.server';
import { OVERRIDE_MARGIN_MS } from '@/lib/events/occurrences';
import { overridesForEvents } from '@/lib/events/occurrences.server';
import { latestUpdatesFor } from '@/lib/events/updates.server';

const DAY_MS = 86_400_000;

/** Prisma `where`: an event that has a start inside [from, ∞) or a series still running. */
export const liveWhere = (from: Date) => ({
  OR: [
    { startsAt: { gte: from } },
    {
      recurrence: { not: null },
      OR: [{ recurUntil: null }, { recurUntil: { gte: new Date(from.getTime() - DAY_MS) } }],
    },
  ],
});

const feedEventSelect = {
  id: true,
  owner: true,
  kind: true,
  hostId: true,
  pollId: true,
  title: true,
  description: true,
  href: true,
  startsAt: true,
  endsAt: true,
  venueKind: true,
  venueRef: true,
  canceledAt: true,
  recurrence: true,
  recurUntil: true,
  recurTz: true,
  community: { select: { name: true } },
} as const;

export async function myEventInputs(userId: string, from: Date, to: Date): Promise<FeedInput[]> {
  const inWindow = {
    visibility: { not: 'DRAFT' as const },
    AND: [liveWhere(from), { startsAt: { lte: to } }],
  };

  const [answers, hosted, pollResponses] = await Promise.all([
    // Every answer the member gave: about a whole event, or about one date of a series.
    prisma.rsvp.findMany({
      where: {
        userId,
        // A date moved into the window may be answered under an original start just outside it (s06-10).
        OR: [
          { occurrenceAt: WHOLE_EVENT },
          {
            occurrenceAt: {
              gte: new Date(from.getTime() - OVERRIDE_MARGIN_MS),
              lte: new Date(to.getTime() + OVERRIDE_MARGIN_MS),
            },
          },
        ],
        event: inWindow,
      },
      take: 600,
      select: {
        status: true,
        occurrenceAt: true,
        everyTime: true,
        event: { select: feedEventSelect },
      },
    }),
    prisma.event.findMany({
      where: { hostId: userId, kind: OFFICE_HOURS_KIND, startsAt: { gte: from, lte: to } },
      take: 100,
      select: {
        ...feedEventSelect,
        rsvps: { where: { occurrenceAt: WHOLE_EVENT }, select: { userId: true }, take: 1 },
      },
    }),
    prisma.availabilityPollResponse.findMany({
      where: { userId },
      select: { pollId: true },
      take: 100,
    }),
  ]);

  const inputs = new Map<string, FeedInput>();
  for (const a of answers) {
    const answer: FeedAnswer = {
      status: a.status,
      occurrenceAt: a.occurrenceAt,
      everyTime: a.everyTime,
    };
    const existing = inputs.get(a.event.id);
    if (existing) existing.answers.push(answer);
    else inputs.set(a.event.id, { event: a.event, answers: [answer] });
  }
  for (const h of hosted) {
    if (!inputs.has(h.id)) inputs.set(h.id, { event: h, answers: [], implicit: 'host' });
  }
  const pollIds = pollResponses.map((r) => r.pollId);
  if (pollIds.length) {
    const pollEvents = await prisma.event.findMany({
      where: { pollId: { in: pollIds }, ...inWindow },
      take: 100,
      select: feedEventSelect,
    });
    for (const e of pollEvents) {
      if (!inputs.has(e.id)) inputs.set(e.id, { event: e, answers: [], implicit: 'poll' });
    }
  }

  // Office hours are titled with the other person: the host sees the guest, the guest the host.
  const officeHours = [...inputs.values()].filter((i) => i.event.kind === OFFICE_HOURS_KIND);
  if (officeHours.length) {
    const guests = new Map(hosted.map((h) => [h.id, h.rsvps[0]?.userId ?? null]));
    const people = await loadPeople(
      officeHours.flatMap((i) => [i.event.hostId, guests.get(i.event.id)].filter((x): x is string => !!x)),
    );
    for (const i of officeHours) {
      const otherId = i.event.hostId === userId ? guests.get(i.event.id) : i.event.hostId;
      const other = otherId ? people.get(otherId) : undefined;
      i.otherName = other?.name ?? other?.handle ?? null;
    }
  }
  // Skipped and moved dates of the repeating events (feed-entries.ts applies them).
  const repeating = [...inputs.values()].filter((i) => i.event.recurrence);
  if (repeating.length) {
    const overrides = await overridesForEvents(repeating.map((i) => i.event.id));
    for (const i of repeating) i.overrides = overrides.get(i.event.id) ?? [];
  }
  // s06-11 — what the host said since, for the calendar description.
  const said = await latestUpdatesFor([...inputs.keys()], userId);
  for (const i of inputs.values()) i.updates = said.get(i.event.id) ?? [];
  return [...inputs.values()];
}

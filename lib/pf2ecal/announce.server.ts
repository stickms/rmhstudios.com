/**
 * Telling the table that something changed.
 *
 * Two jobs, and they share a module because they share the same idea — an
 * announcement is usually *about* a session, and a note about a session stops
 * being worth reading once that session has been and gone.
 *
 * ## The board announces changes nobody explained
 *
 * Moving or cancelling a night is the one edit that other people need to hear
 * about, and the person doing it is halfway out of the sheet. So the edit
 * carries an optional note: write one and it is posted as yours; leave it out
 * and the board posts one itself, marked as automated so nobody mistakes it for
 * a person speaking.
 *
 * **The factual sentence is written first, in code, and posted synchronously.**
 * The DeepSeek rewrite runs afterwards and patches the row if it lands. That
 * ordering is the whole design: a schedule change reaching the table must not
 * depend on an API being up, and the template sentence is already correct —
 * "Wed, Aug 12 moved to Fri, Aug 14, 8:00 PM Eastern / 7:00 PM CDT" says
 * everything that matters. The model only ever makes it read better.
 *
 * ## Notes expire with the night they are about
 *
 * "We're starting an hour late on Wednesday" is worth showing until Wednesday
 * and is clutter on Thursday. An automated note knows its own session. A
 * hand-written one is matched to a session by DeepSeek — and the failure mode
 * is chosen deliberately: no match means no expiry, because a note that
 * lingers is an annoyance and one that vanishes before the night it warned
 * about is a missed game.
 */

import { prisma } from '@/lib/prisma.server';
import {
  inferAnnouncementSession,
  isAITextConfigured,
  writeChangeAnnouncement,
  type SessionChange,
} from '@/lib/ai/text.server';
import { CAMPAIGN_TIME_ZONE, REFERENCE_TIME_ZONE, zoneAbbreviation } from './zoned-time';

/** `Wed, Aug 12, 8:00 PM Eastern / 7:00 PM CDT` — never recomputed by a model. */
export function stampInstant(instant: Date): string {
  const eastern = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPAIGN_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
  const central = new Intl.DateTimeFormat('en-US', {
    timeZone: REFERENCE_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
  return `${eastern} Eastern / ${central} ${zoneAbbreviation(instant, REFERENCE_TIME_ZONE)}`;
}

/**
 * The sentence the board posts when nobody wrote one.
 *
 * Deliberately built from a template rather than generated. It is the version
 * that is guaranteed to exist and guaranteed to be right about the date, which
 * is the only thing an announcement about a schedule change has to get right.
 */
export function describeChange(change: SessionChange): string {
  switch (change.kind) {
    case 'cancelled':
      return `${change.title} on ${change.from} is off.`;
    case 'restored':
      return `${change.title} on ${change.to} is back on.`;
    case 'retimed':
      return `${change.title} now starts at ${change.to} (was ${change.from}).`;
    default:
      return `${change.title} has moved from ${change.from} to ${change.to}.`;
  }
}

/**
 * Classify an edit. Null when nothing worth announcing happened — a retitled
 * session or a tweaked note is not news, and posting for every keystroke of an
 * edit would make the board useless.
 */
export function classifyChange(
  before: { title: string; startsAt: Date; canceledAt: Date | null; location: string },
  after: { title: string; startsAt: Date; canceledAt: Date | null; location: string },
): SessionChange | null {
  const base = { title: after.title, location: after.location };

  if (!before.canceledAt && after.canceledAt) {
    return { ...base, kind: 'cancelled', from: stampInstant(before.startsAt), to: '' };
  }
  if (before.canceledAt && !after.canceledAt) {
    return { ...base, kind: 'restored', from: '', to: stampInstant(after.startsAt) };
  }
  if (before.startsAt.getTime() === after.startsAt.getTime()) return null;

  // Same calendar day in the campaign zone means the hour moved, not the night
  // — "starting an hour later" and "moved to Friday" are different news and
  // read differently.
  const dayOf = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: CAMPAIGN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const kind = dayOf(before.startsAt) === dayOf(after.startsAt) ? 'retimed' : 'moved';
  return {
    ...base,
    kind,
    from: stampInstant(before.startsAt),
    to: stampInstant(after.startsAt),
  };
}

/**
 * Post the note for a change, and start the rewrite.
 *
 * `body` is the editor's own words when they wrote some. Otherwise the template
 * sentence goes up immediately and DeepSeek is given a chance to improve it —
 * fire-and-forget, because the row already says the right thing and nobody
 * should wait two seconds on a sheet closing.
 */
export async function announceChange(input: {
  sessionId: string;
  change: SessionChange;
  /** The end of the session, so the note clears itself once the night is over. */
  expiresAt: Date;
  authorId: string | null;
  /** The editor's own words, or null to have the board write it. */
  body: string | null;
}): Promise<void> {
  const automated = input.body === null;
  const created = await prisma.pf2eAnnouncement.create({
    data: {
      body: (automated ? describeChange(input.change) : input.body!).slice(0, 2000),
      // An automated note is never pinned: pinning is a person saying "keep
      // this up", and the board does not get to make that call.
      pinned: false,
      sessionId: input.sessionId,
      expiresAt: input.expiresAt,
      automated,
      authorId: automated ? null : input.authorId,
    },
    select: { id: true },
  });

  if (!automated || !isAITextConfigured()) return;

  // Deliberately not awaited. The announcement is already posted and already
  // correct; this only improves the wording, and the caller is a PATCH whose
  // response should not wait on an upstream model. The catch is not optional —
  // an unhandled rejection here would take the process down.
  void writeChangeAnnouncement(input.change)
    .then(async (better) => {
      if (!better) return;
      await prisma.pf2eAnnouncement.updateMany({
        where: { id: created.id, automated: true },
        data: { body: better.slice(0, 2000) },
      });
    })
    .catch((cause: unknown) => {
      console.error('[pf2ecal] change announcement rewrite failed:', cause);
    });
}

/**
 * Give a hand-written announcement an expiry, if it is about a session.
 *
 * Runs after the note is posted, for the same reason as the rewrite above: the
 * note must appear the instant someone presses Post, and whether it expires is
 * a refinement. A failure anywhere here leaves `expiresAt` null, which is the
 * behaviour the board had before this existed.
 */
export async function scheduleAnnouncementExpiry(
  announcementId: string,
  body: string,
  now: Date = new Date(),
): Promise<void> {
  if (!isAITextConfigured()) return;

  const upcoming = await prisma.pf2eSession.findMany({
    where: { startsAt: { gt: now }, canceledAt: null },
    orderBy: { startsAt: 'asc' },
    take: 8,
    select: { id: true, title: true, startsAt: true, endsAt: true },
  });
  if (!upcoming.length) return;

  const chosen = await inferAnnouncementSession(
    body,
    upcoming.map((s) => ({ id: s.id, label: `${s.title} — ${stampInstant(s.startsAt)}` })),
  );
  if (!chosen) return;

  const session = upcoming.find((s) => s.id === chosen);
  if (!session) return;

  await prisma.pf2eAnnouncement.updateMany({
    where: { id: announcementId },
    data: { sessionId: session.id, expiresAt: session.endsAt },
  });
}

/**
 * Written feedback on jam entries, the server half (s06-07; the rules, limits and payload shape are in
 * `jam-feedback.ts`).
 *
 * Feedback rides on a rating: `rateEntry` calls `saveFeedback` inside its transaction, so the scores and the
 * words are written together (upsert by `ratingId`) and only someone allowed to rate can write. It is private to
 * the entry's team (submitter and accepted teammates) and admins; anonymity is applied in `shapeFeedback`, so an
 * anonymous author id never leaves the server except to an admin. The team is told by a batched notification:
 * `notifyTeamOfFeedback` claims `GameJamEntry.feedbackNotifiedAt` with a compare-and-set, so ten raters inside an
 * hour produce one notification.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import {
  FEEDBACK_LIST_CAP,
  feedbackIntent,
  feedbackViewer,
  mayListFeedback,
  mayMarkHelpful,
  notifyDue,
  shapeFeedback,
  type FeedbackDTO,
  type FeedbackRefusal,
  type FeedbackViewer,
  type MyFeedbackDTO,
} from '@/lib/competitive/jam-feedback';

export type FeedbackResult<T> = { ok: true; value: T } | { ok: false; code: FeedbackRefusal };
const refuse = (code: FeedbackRefusal): { ok: false; code: FeedbackRefusal } => ({ ok: false, code });

const FEEDBACK_ENTITY = 'jam_feedback';

/** What `saveFeedback` did, for `rateEntry`'s answer. */
export type FeedbackSaveOutcome = 'unchanged' | 'created' | 'edited' | 'cleared' | 'blocked' | 'banned' | 'invalid';

/**
 * Save (or edit, or withdraw) the rater's feedback inside the rating's transaction. `entry` is the entry being
 * rated and `ratingId` the rating just upserted. A rater blocked either way by the submitter or any accepted
 * teammate, or banned, cannot leave feedback (the rating itself stands). A piece a moderator removed stays removed.
 */
export async function saveFeedback(
  tx: Prisma.TransactionClient,
  input: {
    entry: { id: string; userId: string };
    ratingId: string;
    raterId: string;
    feedback: string | null | undefined;
    anonymous: boolean | undefined;
    now: Date;
  },
): Promise<FeedbackSaveOutcome> {
  const intent = feedbackIntent(input.feedback);
  if (intent.kind === 'none') {
    // Only the name switch changed: keep it on the existing piece.
    if (input.anonymous === undefined) return 'unchanged';
    await tx.gameJamFeedback.updateMany({
      where: { ratingId: input.ratingId, removedAt: null },
      data: { anonymous: input.anonymous },
    });
    return 'unchanged';
  }
  if (intent.kind === 'invalid') return 'invalid';
  if (intent.kind === 'clear') {
    const gone = await tx.gameJamFeedback.deleteMany({ where: { ratingId: input.ratingId, removedAt: null } });
    return gone.count > 0 ? 'cleared' : 'unchanged';
  }

  const rater = await tx.user.findUnique({ where: { id: input.raterId }, select: { bannedUntil: true } });
  if (rater?.bannedUntil && rater.bannedUntil.getTime() > input.now.getTime()) return 'banned';
  const accepted = await tx.gameJamTeamMember.findMany({
    where: { entryId: input.entry.id, status: 'accepted' },
    select: { userId: true },
  });
  const team = [input.entry.userId, ...(Array.isArray(accepted) ? accepted.map((m) => m.userId) : [])];
  const blocked = await tx.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: { in: team }, blockedId: input.raterId },
        { blockerId: input.raterId, blockedId: { in: team } },
      ],
    },
    select: { id: true },
  });
  if (blocked) return 'blocked';

  const existing = await tx.gameJamFeedback.findUnique({
    where: { ratingId: input.ratingId },
    select: { id: true, removedAt: true },
  });
  if (existing?.removedAt) return 'unchanged';
  const anonymous = input.anonymous ?? false;
  await tx.gameJamFeedback.upsert({
    where: { ratingId: input.ratingId },
    create: {
      ratingId: input.ratingId,
      entryId: input.entry.id,
      authorId: input.raterId,
      body: intent.body,
      anonymous,
    },
    update: { body: intent.body, ...(input.anonymous === undefined ? {} : { anonymous }) },
  });
  return existing ? 'edited' : 'created';
}

async function notifySafely(input: Parameters<typeof createNotification>[0]): Promise<void> {
  try {
    await createNotification(input);
  } catch (err) {
    console.error('[jam-feedback] notification failed:', err);
  }
}

/**
 * Tell the team new feedback arrived, at most once an hour per entry. The claim is a conditional update on the
 * marker as it was read (null, or a full window old), so two raters finishing together claim once. The count is
 * the pieces written since the previous notice.
 */
export async function notifyTeamOfFeedback(
  entryId: string,
  authorId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const entry = await prisma.gameJamEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      userId: true,
      feedbackNotifiedAt: true,
      jam: { select: { slug: true, title: true } },
    },
  });
  if (!entry || !notifyDue(entry.feedbackNotifiedAt, now)) return false;
  const claimed = await prisma.gameJamEntry.updateMany({
    where: { id: entry.id, feedbackNotifiedAt: entry.feedbackNotifiedAt },
    data: { feedbackNotifiedAt: now },
  });
  if (claimed.count !== 1) return false;

  const [count, team] = await Promise.all([
    prisma.gameJamFeedback.count({
      where: {
        entryId: entry.id,
        removedAt: null,
        ...(entry.feedbackNotifiedAt ? { createdAt: { gt: entry.feedbackNotifiedAt } } : {}),
      },
    }),
    prisma.gameJamTeamMember.findMany({ where: { entryId: entry.id, status: 'accepted' }, select: { userId: true } }),
  ]);
  const n = Math.max(1, count);
  const preview =
    n === 1
      ? `New feedback on your entry in ${entry.jam.title}`
      : `${n} new pieces of feedback on your entry in ${entry.jam.title}`;
  for (const userId of new Set([entry.userId, ...team.map((m) => m.userId)])) {
    // The author is not told about their own words (and is never named: feedback can be anonymous).
    if (userId === authorId) continue;
    await notifySafely({
      userId,
      type: 'SYSTEM',
      entityType: FEEDBACK_ENTITY,
      entityId: entry.id,
      preview,
      link: `/jams/${entry.jam.slug}`,
    });
  }
  return true;
}

interface EntryFacts {
  id: string;
  userId: string;
  acceptedIds: string[];
}

async function readTeam(slug: string, entryId: string): Promise<EntryFacts | null> {
  const row = await prisma.gameJamEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      userId: true,
      jam: { select: { slug: true } },
      team: { where: { status: 'accepted' }, select: { userId: true } },
    },
  });
  if (!row || row.jam.slug !== slug) return null;
  return { id: row.id, userId: row.userId, acceptedIds: row.team.map((m) => m.userId) };
}

/**
 * The feedback on an entry, for its submitter, accepted teammates and admins (anyone else is refused, whether
 * or not there is any). Removed pieces are not listed. Anonymous pieces carry no author unless an admin reads.
 */
export async function listFeedback(input: {
  slug: string;
  entryId: string;
  actorId: string | null;
  isAdmin: boolean;
}): Promise<FeedbackResult<FeedbackDTO[]>> {
  const entry = await readTeam(input.slug, input.entryId);
  if (!entry) return refuse('not-found');
  const viewer = feedbackViewer({
    ownerId: entry.userId,
    acceptedIds: entry.acceptedIds,
    viewerId: input.actorId,
    isAdmin: input.isAdmin,
  });
  if (!mayListFeedback(viewer)) return refuse('forbidden');
  const rows = await prisma.gameJamFeedback.findMany({
    where: { entryId: entry.id, removedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: FEEDBACK_LIST_CAP,
    select: {
      id: true,
      body: true,
      anonymous: true,
      createdAt: true,
      helpfulAt: true,
      author: { select: userDisplaySelect },
    },
  });
  return {
    ok: true,
    value: rows.map((r) => shapeFeedback({ ...r, author: resolveUser(r.author) }, viewer)),
  };
}

/** The team flags (or unflags) one piece as Helpful. Setting it twice keeps the first time; a removed piece is gone. */
export async function markHelpful(input: {
  slug: string;
  feedbackId: string;
  actorId: string;
  helpful: boolean;
}): Promise<FeedbackResult<true>> {
  const row = await prisma.gameJamFeedback.findUnique({
    where: { id: input.feedbackId },
    select: { id: true, entryId: true, removedAt: true },
  });
  if (!row || row.removedAt) return refuse('not-found');
  const entry = await readTeam(input.slug, row.entryId);
  if (!entry) return refuse('not-found');
  const viewer: FeedbackViewer = feedbackViewer({
    ownerId: entry.userId,
    acceptedIds: entry.acceptedIds,
    viewerId: input.actorId,
    isAdmin: false,
  });
  if (!mayMarkHelpful(viewer)) return refuse('forbidden');
  if (input.helpful) {
    await prisma.gameJamFeedback.updateMany({
      where: { id: row.id, removedAt: null, helpfulAt: null },
      data: { helpfulAt: new Date() },
    });
  } else {
    await prisma.gameJamFeedback.updateMany({
      where: { id: row.id, removedAt: null, helpfulAt: { not: null } },
      data: { helpfulAt: null },
    });
  }
  return { ok: true, value: true };
}

/** The rater's own feedback on the entries of one jam, keyed by entry (what the rating form re-opens with). */
export async function myFeedbackFor(
  raterId: string,
  entryIds: readonly string[],
): Promise<Record<string, MyFeedbackDTO>> {
  if (entryIds.length === 0) return {};
  const rows = await prisma.gameJamFeedback.findMany({
    where: { authorId: raterId, entryId: { in: [...entryIds] }, removedAt: null },
    select: { entryId: true, body: true, anonymous: true, helpfulAt: true },
  });
  const out: Record<string, MyFeedbackDTO> = {};
  for (const r of Array.isArray(rows) ? rows : [])
    out[r.entryId] = { body: r.body, anonymous: r.anonymous, helpful: r.helpfulAt !== null };
  return out;
}

/** How many pieces of feedback each of these entries has (for "Feedback (n)"); only ever asked for the viewer's own team's entries. */
export async function feedbackCounts(entryIds: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (entryIds.length === 0) return out;
  const grouped = await prisma.gameJamFeedback.groupBy({
    by: ['entryId'],
    where: { entryId: { in: [...entryIds] }, removedAt: null },
    _count: { _all: true },
  });
  for (const g of Array.isArray(grouped) ? grouped : []) out.set(g.entryId, g._count._all);
  return out;
}

/**
 * Account erasure operations (the cascade never fires on an anonymised account): the feedback the member wrote.
 * Feedback they received sits on entries that stay (it is other people's words, not theirs to erase).
 */
export function jamFeedbackErasureOps(userId: string) {
  return [prisma.gameJamFeedback.deleteMany({ where: { authorId: userId } })] as const;
}

/** The data export: the feedback the member wrote (entry title, text, dates). Feedback received is not exported. */
export async function exportJamFeedback(userId: string) {
  const rows = await prisma.gameJamFeedback.findMany({
    where: { authorId: userId },
    orderBy: { createdAt: 'asc' },
    take: 1000,
    select: {
      entryId: true,
      body: true,
      anonymous: true,
      createdAt: true,
      updatedAt: true,
      entry: { select: { build: { select: { title: true } }, jam: { select: { title: true } } } },
    },
  });
  return rows.map((r) => ({
    entryId: r.entryId,
    entryTitle: r.entry.build.title,
    jamTitle: r.entry.jam.title,
    text: r.body,
    anonymous: r.anonymous,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * Read-alongs (s11-09, server-only): a library book read together in a community, in weekly parts.
 *
 * Moderators start one (the cap is two active per community, taken under an advisory lock), edit the parts until the
 * first one opens, cancel it, and resume it after a pause. Members join, leave and mark the parts they have finished.
 * `postDuePart` posts a part's thread; the jobs worker (`read-along-jobs.server.ts`) claims each part first.
 *
 * A part's thread goes through the same gates as a member's post: `prepareCommunityPost` (membership, bans and
 * timeouts, flair, verification, AutoMod) runs before anything is stored, and a refusal or an AutoMod hold pauses the
 * read-along with a reason instead of leaving a draft. The thread is posted as `createdById`, the moderator who started
 * it (or who last resumed it), behind the content warning "Spoilers: <part label>".
 */
import type { Prisma, ReadAlong, ReadAlongPart } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { dayOf, parseDay } from '@/lib/calendar/tz';
import { userChipSelect } from '@/lib/user-display';
import { SITE_URL } from '@/lib/seo';
import { canModerate, type CommunityRole } from '@/lib/communities/access.server';
import { activeSanction } from '@/lib/communities/bans.server';
import { denyCode, denyText } from '@/lib/communities/bans';
import { logModAction } from '@/lib/communities/modlog.server';
import { resolveWikiCommunity } from '@/lib/communities/page-access.server';
import { prepareCommunityPost } from '@/lib/communities/post-gate.server';
import { publishScheduledPost } from '@/lib/scheduled/publish.server';
import {
  MAX_ACTIVE,
  MAX_READERS,
  canReadAlong,
  PAUSE_REASONS,
  composePartPost,
  formatTime,
  openingsAfter,
  openingsFor,
  openingsFromDay,
  parseTime,
  partsProblem,
  spoilerWarning,
  STATUSES,
  type PartDraft,
  type PartDTO,
  type PauseReason,
  type ReadAlongPageDTO,
  type ReadAlongStatus,
  type ReadAlongSummaryDTO,
  type Schedule,
} from '@/lib/communities/read-along';
import type { StartReadAlongBody } from '@/lib/communities/read-along-schema';

/** The part of a library book a read-along needs. */
export interface BookInfo {
  slug: string;
  title: string;
  pages: number;
}

/** A refusal the route turns into a status and a coded body (`refusalBody`); never free text from a caught error. */
export class ReadAlongError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly params?: Record<string, number>,
    /** A community sanction refuses with the body the sanction notices already read. */
    readonly sanction?: { kind: 'ban' | 'timeout'; endsAt: Date | null },
  ) {
    super(code);
    this.name = 'ReadAlongError';
  }
}

/** The response a route sends for a `ReadAlongError`. */
export function refusalResponse(e: ReadAlongError): Response {
  if (e.sanction) {
    return Response.json(
      {
        error: denyText(e.sanction.kind, e.sanction.endsAt),
        code: denyCode(e.sanction.kind),
        endsAt: e.sanction.endsAt ? e.sanction.endsAt.toISOString() : null,
      },
      { status: 403 },
    );
  }
  const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'FORBIDDEN' ? 403 : e.code === 'INVALID_INPUT' ? 400 : 409;
  return Response.json({ ...refusalBody(e.code, e.params) }, { status });
}

const STATUS_SET: ReadonlySet<string> = new Set(STATUSES);
const PAUSE_SET: ReadonlySet<string> = new Set(PAUSE_REASONS);
const statusOf = (v: string): ReadAlongStatus => (STATUS_SET.has(v) ? (v as ReadAlongStatus) : 'cancelled');
const pauseOf = (v: string | null): PauseReason | null => (v && PAUSE_SET.has(v) ? (v as PauseReason) : null);

/** Advisory-lock keys: one per community for the active cap, one per read-along for the reader cap. */
export const communityLock = (communityId: string) => `read-alongs:${communityId}`;
export const readersLock = (readAlongId: string) => `read-along-readers:${readAlongId}`;

const LIST_MAX = 20;

const scheduleOf = (row: Pick<ReadAlong, 'weekday' | 'minuteOfDay' | 'timeZone'>): Schedule => ({
  weekday: row.weekday,
  minuteOfDay: row.minuteOfDay,
  timeZone: row.timeZone,
});

/** The page address of a read-along. */
export const readAlongPath = (slug: string, id: string) => `/c/${slug}/read/${id}`;

// ─── Reading ────────────────────────────────────────────────────────────────────────────────────────────────────

type SummaryRow = ReadAlong & {
  parts: Pick<ReadAlongPart, 'postedAt' | 'opensAt'>[];
  _count: { readers: number };
};

export function toSummary(row: SummaryRow, canSeeReason: boolean): ReadAlongSummaryDTO {
  const unposted = row.parts.filter((p) => !p.postedAt).sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime());
  const status = statusOf(row.status);
  return {
    id: row.id,
    bookTitle: row.bookTitle,
    status,
    pausedReason: canSeeReason && status === 'paused' ? pauseOf(row.pausedReason) : null,
    partCount: row.parts.length,
    openedCount: row.parts.length - unposted.length,
    nextOpensAt: status === 'active' && unposted[0] ? unposted[0].opensAt.toISOString() : null,
    readerCount: row._count.readers,
  };
}

const SUMMARY_INCLUDE = {
  parts: { select: { postedAt: true, opensAt: true } },
  _count: { select: { readers: true } },
} as const;

/** The community's read-alongs that are running, paused or finished. Pause reasons are for moderators. */
export async function listReadAlongs(communityId: string, isMod: boolean): Promise<ReadAlongSummaryDTO[]> {
  const rows = await prisma.readAlong.findMany({
    where: { communityId, status: { in: ['active', 'paused', 'done'] } },
    orderBy: { createdAt: 'desc' },
    take: LIST_MAX,
    include: SUMMARY_INCLUDE,
  });
  return (Array.isArray(rows) ? rows : []).map((r) => toSummary(r as SummaryRow, isMod));
}

/**
 * One read-along for the page: the read-along with its parts and starter in one query and, for a member of the
 * community, its readers in a second (at most 2,000, so the viewer's own row is among them). A non-member of a public
 * community sees the book, the parts and the number of readers, and no names. `null` is a 404: the community or the
 * read-along does not exist, or the community is private and the viewer may not read it; the answers are the same.
 * Nothing here reads a reply, like or view count.
 */
export async function getReadAlongPage(args: {
  slug: string;
  id: string;
  viewerId: string | null;
  isSiteAdmin?: boolean;
}): Promise<ReadAlongPageDTO | null> {
  const { slug, id, viewerId } = args;
  const isSiteAdmin = args.isSiteAdmin ?? false;
  const resolved = await resolveWikiCommunity({ slug }, viewerId, isSiteAdmin);
  if (!resolved) return null;
  const { community, access } = resolved;

  const row = await prisma.readAlong.findFirst({
    where: { id, communityId: community.id },
    include: {
      parts: { orderBy: { position: 'asc' } },
      createdBy: { select: userChipSelect },
      _count: { select: { readers: true } },
    },
  });
  if (!row) return null;

  const banned = access.writeRefusal?.reason === 'COMMUNITY_BANNED';
  const isMember = access.role !== null && !banned;
  const isMod = canModerate(access.role) && !banned;
  const canManage = isSiteAdmin || isMod;

  const readerRows =
    isMember && viewerId
      ? await prisma.readAlongReader.findMany({
          where: {
            readAlongId: row.id,
            // Members who blocked the viewer, or whom the viewer blocked, are not listed to them.
            user: {
              NOT: {
                OR: [
                  { blocksMade: { some: { blockedId: viewerId } } },
                  { blocksReceived: { some: { blockerId: viewerId } } },
                ],
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
          take: MAX_READERS,
          include: { user: { select: userChipSelect } },
        })
      : null;
  const readers = readerRows ? (Array.isArray(readerRows) ? readerRows : []) : null;
  const mine = readers && viewerId ? readers.find((r) => r.userId === viewerId) : undefined;

  const status = statusOf(row.status);
  const parts: PartDTO[] = row.parts.map((p) => ({
    id: p.id,
    position: p.position,
    label: p.label,
    startPage: p.startPage,
    endPage: p.endPage,
    opensAt: p.opensAt.toISOString(),
    postId: p.postId,
    opened: p.postedAt !== null,
  }));
  const open = status === 'active' || status === 'paused';
  return {
    id: row.id,
    communitySlug: community.slug,
    communityName: community.name,
    docSlug: row.docSlug,
    bookTitle: row.bookTitle,
    status,
    pausedReason: canManage && status === 'paused' ? pauseOf(row.pausedReason) : null,
    weekday: row.weekday,
    time: formatTime(row.minuteOfDay),
    timeZone: row.timeZone,
    startedBy: row.createdBy ? { id: row.createdBy.id, name: row.createdBy.name, handle: row.createdBy.handle } : null,
    parts,
    readerCount: row._count.readers,
    readers: readers
      ? readers.map((r) => ({
          id: r.user.id,
          name: r.user.name,
          handle: r.user.handle,
          lastPartDone: r.lastPartDone,
        }))
      : null,
    me: mine ? { notify: mine.notify, lastPartDone: mine.lastPartDone } : null,
    canManage,
    canJoin: isMember && !mine && open && access.writeRefusal === null,
    editable: canManage && open && parts.every((p) => !p.opened),
  };
}

// ─── Starting, editing, cancelling, resuming ────────────────────────────────────────────────────────────────────

const toParts = (parts: readonly PartDraft[], opens: readonly number[]) =>
  parts.map((p, i) => ({
    position: i + 1,
    label: p.label.trim(),
    startPage: p.startPage,
    endPage: p.endPage,
    opensAt: new Date(opens[i] ?? 0),
  }));

async function assertRoom(tx: Prisma.TransactionClient, communityId: string, exceptId?: string): Promise<void> {
  const active = await tx.readAlong.count({
    where: { communityId, status: 'active', ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  if (active >= MAX_ACTIVE) throw new ReadAlongError('READ_ALONG_CAP', { max: MAX_ACTIVE });
}

/** Start a read-along of a library book. The caller has passed `requireMod`. */
export async function startReadAlong(args: {
  communityId: string;
  actorId: string;
  body: StartReadAlongBody;
  /** The library book `body.docSlug` names, read by the caller (`read-along-books.server.ts`); undefined when it is not listed. */
  book: BookInfo | undefined;
  now?: Date;
}): Promise<ReadAlongSummaryDTO> {
  const { communityId, actorId, body, book } = args;
  const now = (args.now ?? new Date()).getTime();
  if (!book || !canReadAlong(book.pages)) throw new ReadAlongError('NOT_FOUND');
  if (partsProblem(body.parts, book.pages) !== null || parseDay(body.startDay) === null) {
    throw new ReadAlongError('INVALID_INPUT');
  }
  const minuteOfDay = parseTime(body.time);
  if (minuteOfDay === null) throw new ReadAlongError('INVALID_INPUT');
  const schedule: Schedule = { weekday: body.weekday, minuteOfDay, timeZone: body.timeZone };
  const opens = openingsFor(schedule, body.startDay, body.parts.length);
  // The first part must open in the future: a start in the past would post at the next sweep.
  if ((opens[0] ?? 0) <= now) throw new ReadAlongError('INVALID_INPUT');

  const row = await prisma.$transaction(async (tx) => {
    await lockKey(tx, communityLock(communityId));
    await assertRoom(tx, communityId);
    const created = await tx.readAlong.create({
      data: {
        communityId,
        createdById: actorId,
        docSlug: book.slug,
        bookTitle: book.title.slice(0, 200),
        weekday: schedule.weekday,
        minuteOfDay: schedule.minuteOfDay,
        timeZone: schedule.timeZone,
        status: 'active',
        parts: { create: toParts(body.parts, opens) },
      },
      include: SUMMARY_INCLUDE,
    });
    await logModAction(tx, {
      communityId,
      actorId,
      action: 'read_along_started',
      targetType: 'read_along',
      targetId: created.id,
      detail: { name: created.bookTitle.slice(0, 60) },
    });
    return created;
  });
  return toSummary(row as SummaryRow, true);
}

/** Replace the parts before the first one opens. The parts keep the weekly times counted from the first part's day. */
export async function replaceParts(args: {
  communityId: string;
  id: string;
  parts: readonly PartDraft[];
  /** The page count of a library book by slug (`read-along-books.server.ts`); undefined when it has left the library. */
  pagesOf: (docSlug: string) => Promise<number | undefined>;
}): Promise<ReadAlongSummaryDTO> {
  const { communityId, id, parts } = args;
  const found = await prisma.readAlong.findFirst({ where: { id, communityId }, select: { docSlug: true } });
  if (!found) throw new ReadAlongError('NOT_FOUND');
  // A book that has left the library can no longer bound the page ranges; the order and size checks still apply.
  const pages = (await args.pagesOf(found.docSlug)) ?? 100_000;
  if (partsProblem(parts, pages) !== null) throw new ReadAlongError('INVALID_INPUT');

  const row = await prisma.$transaction(async (tx) => {
    await lockKey(tx, communityLock(communityId));
    const current = await tx.readAlong.findFirst({
      where: { id, communityId },
      include: { parts: { orderBy: { position: 'asc' } } },
    });
    if (!current) throw new ReadAlongError('NOT_FOUND');
    const status = statusOf(current.status);
    if (status === 'cancelled' || status === 'done') throw new ReadAlongError('READ_ALONG_ENDED');
    if (current.parts.some((p) => p.postedAt !== null)) throw new ReadAlongError('READ_ALONG_STARTED');
    // A running read-along whose first part is due is about to be claimed by the sweep: the edit window has closed.
    if (status === 'active' && current.parts.some((p) => p.opensAt.getTime() <= Date.now())) {
      throw new ReadAlongError('READ_ALONG_STARTED');
    }
    const first = current.parts[0];
    const schedule = scheduleOf(current);
    const firstDay = first ? dayOf(first.opensAt.getTime(), schedule.timeZone) : dayOf(Date.now(), schedule.timeZone);
    const opens = openingsFromDay(schedule, firstDay, parts.length);
    await tx.readAlongPart.deleteMany({ where: { readAlongId: id } });
    await tx.readAlongPart.createMany({
      data: toParts(parts, opens).map((p) => ({ ...p, readAlongId: id })),
    });
    return tx.readAlong.update({ where: { id }, data: { updatedAt: new Date() }, include: SUMMARY_INCLUDE });
  });
  return toSummary(row as SummaryRow, true);
}

/** Stop future parts. Threads already posted stay. */
export async function cancelReadAlong(args: {
  communityId: string;
  id: string;
  actorId: string;
}): Promise<ReadAlongSummaryDTO> {
  const { communityId, id, actorId } = args;
  const row = await prisma.$transaction(async (tx) => {
    await lockKey(tx, communityLock(communityId));
    const current = await tx.readAlong.findFirst({ where: { id, communityId }, select: { status: true } });
    if (!current) throw new ReadAlongError('NOT_FOUND');
    const status = statusOf(current.status);
    if (status === 'cancelled' || status === 'done') throw new ReadAlongError('READ_ALONG_ENDED');
    const updated = await tx.readAlong.update({
      where: { id },
      data: { status: 'cancelled', pausedReason: null },
      include: SUMMARY_INCLUDE,
    });
    await logModAction(tx, {
      communityId,
      actorId,
      action: 'read_along_cancelled',
      targetType: 'read_along',
      targetId: id,
      detail: { name: updated.bookTitle.slice(0, 60) },
    });
    return updated;
  });
  return toSummary(row as SummaryRow, true);
}

/**
 * Resume a paused read-along. The cap applies again, the moderator who resumes it becomes the one it posts as (a pause
 * for a starter who left or was sanctioned would otherwise repeat), and parts whose date went by during the pause are
 * moved to the next weekly times, so a long pause never opens several parts at once.
 */
export async function resumeReadAlong(args: {
  communityId: string;
  id: string;
  actorId: string;
  now?: Date;
}): Promise<ReadAlongSummaryDTO> {
  const { communityId, id, actorId } = args;
  const now = (args.now ?? new Date()).getTime();
  const row = await prisma.$transaction(async (tx) => {
    await lockKey(tx, communityLock(communityId));
    const current = await tx.readAlong.findFirst({
      where: { id, communityId },
      include: { parts: { orderBy: { position: 'asc' } } },
    });
    if (!current) throw new ReadAlongError('NOT_FOUND');
    const status = statusOf(current.status);
    if (status === 'cancelled' || status === 'done') throw new ReadAlongError('READ_ALONG_ENDED');
    if (status === 'paused') {
      await assertRoom(tx, communityId, id);
      await reflowUnposted(tx, current, now);
    }
    return tx.readAlong.update({
      where: { id },
      data: { status: 'active', pausedReason: null, createdById: actorId },
      include: SUMMARY_INCLUDE,
    });
  });
  return toSummary(row as SummaryRow, true);
}

/**
 * Move every unposted part to the weekly times after `now` when the first of them is already due: the read-along
 * resumes (or a late sweep catches up) one part at a time, a week apart.
 */
export async function reflowUnposted(
  tx: Prisma.TransactionClient,
  row: Pick<ReadAlong, 'id' | 'weekday' | 'minuteOfDay' | 'timeZone'> & { parts?: ReadAlongPart[] },
  now: number,
): Promise<void> {
  const unposted = (
    row.parts ?? (await tx.readAlongPart.findMany({ where: { readAlongId: row.id }, orderBy: { position: 'asc' } }))
  ).filter((p) => p.postedAt === null);
  const first = unposted[0];
  if (!first || first.opensAt.getTime() > now) return;
  const opens = openingsAfter(scheduleOf(row), now, unposted.length);
  for (const [i, part] of unposted.entries()) {
    await tx.readAlongPart.updateMany({
      where: { id: part.id, postedAt: null },
      data: { opensAt: new Date(opens[i] ?? now) },
    });
  }
}

// ─── Readers ────────────────────────────────────────────────────────────────────────────────────────────────────

async function loadForReader(communityId: string, id: string) {
  const row = await prisma.readAlong.findFirst({
    where: { id, communityId },
    select: { id: true, status: true },
  });
  if (!row) throw new ReadAlongError('NOT_FOUND');
  return row;
}

/**
 * Join a read-along (or change "Tell me when a part opens" when already joined). Only members of the community can
 * join; a community ban or timeout and a site ban refuse it (`activeSanction`), and at most 2,000 members join one
 * read-along (counted under the read-along's lock).
 */
export async function joinReadAlong(args: {
  communityId: string;
  id: string;
  userId: string;
  notify?: boolean | undefined;
  now?: Date;
}): Promise<{ notify: boolean }> {
  const { communityId, id, userId } = args;
  const now = args.now ?? new Date();
  const row = await loadForReader(communityId, id);
  const status = statusOf(row.status);
  if (status === 'cancelled' || status === 'done') throw new ReadAlongError('READ_ALONG_ENDED');

  const [member, account, sanction] = await Promise.all([
    prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { id: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } }),
    activeSanction(communityId, userId, now),
  ]);
  // A member the community banned reads like a non-member; a timed-out one reads and cannot join.
  if (sanction) throw new ReadAlongError('FORBIDDEN', undefined, { kind: sanction.kind, endsAt: sanction.endsAt });
  if (!member) throw new ReadAlongError('FORBIDDEN');
  if (account?.bannedUntil && account.bannedUntil.getTime() > now.getTime()) throw new ReadAlongError('FORBIDDEN');

  return prisma.$transaction(async (tx) => {
    await lockKey(tx, readersLock(id));
    const existing = await tx.readAlongReader.findUnique({
      where: { readAlongId_userId: { readAlongId: id, userId } },
      select: { notify: true },
    });
    if (existing) {
      const notify = args.notify ?? existing.notify;
      if (notify !== existing.notify) {
        await tx.readAlongReader.update({
          where: { readAlongId_userId: { readAlongId: id, userId } },
          data: { notify },
        });
      }
      return { notify };
    }
    const joined = await tx.readAlongReader.count({ where: { readAlongId: id } });
    if (joined >= MAX_READERS) throw new ReadAlongError('READ_ALONG_FULL', { max: MAX_READERS });
    const notify = args.notify ?? true;
    await tx.readAlongReader.create({ data: { readAlongId: id, userId, notify } });
    return { notify };
  });
}

/** Leave a read-along. Leaving one that was never joined is not an error. */
export async function leaveReadAlong(args: { communityId: string; id: string; userId: string }): Promise<void> {
  const row = await loadForReader(args.communityId, args.id);
  await prisma.readAlongReader.deleteMany({ where: { readAlongId: row.id, userId: args.userId } });
}

/**
 * "I've finished this part": the reader's own last finished part. A part that has not opened cannot be marked, and
 * 0 clears it. Marking is the reader's own record, so a ban does not stop a member from changing it.
 */
export async function markPart(args: {
  communityId: string;
  id: string;
  userId: string;
  part: number;
}): Promise<{ lastPartDone: number }> {
  const row = await loadForReader(args.communityId, args.id);
  const opened = await prisma.readAlongPart.count({ where: { readAlongId: row.id, postedAt: { not: null } } });
  if (args.part > opened) throw new ReadAlongError('INVALID_INPUT');
  const { count } = await prisma.readAlongReader.updateMany({
    where: { readAlongId: row.id, userId: args.userId },
    data: { lastPartDone: args.part },
  });
  if (count !== 1) throw new ReadAlongError('FORBIDDEN');
  return { lastPartDone: args.part };
}

// ─── Posting a part ─────────────────────────────────────────────────────────────────────────────────────────────

export type PartResult = { ok: true; postId: string } | { ok: false; reason: PauseReason };

/**
 * Post one part's thread as the read-along's moderator, behind "Spoilers: <label>". Claiming the part (`postedAt`) is
 * the caller's job and happens before this runs; nothing here touches the part's own row.
 */
export async function postDuePart(
  row: Pick<ReadAlong, 'id' | 'communityId' | 'createdById' | 'bookTitle'>,
  part: Pick<ReadAlongPart, 'label' | 'startPage' | 'endPage'>,
  now: Date,
): Promise<PartResult> {
  const community = await prisma.community.findUnique({
    where: { id: row.communityId },
    select: { id: true, slug: true },
  });
  if (!community) return { ok: false, reason: 'community_gone' };

  const [member, author] = await Promise.all([
    prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: row.communityId, userId: row.createdById } },
      select: { role: true },
    }),
    // Not a display shape: only the account-wide ban matters here.
    prisma.user.findUnique({ where: { id: row.createdById }, select: { bannedUntil: true } }),
  ]);
  if (!member || !canModerate(member.role as CommunityRole) || !author) {
    return { ok: false, reason: 'author_not_moderator' };
  }
  if (author.bannedUntil && author.bannedUntil.getTime() > now.getTime()) {
    return { ok: false, reason: 'author_sanctioned' };
  }
  if (await activeSanction(row.communityId, row.createdById)) return { ok: false, reason: 'author_sanctioned' };

  const content = composePartPost({
    bookTitle: row.bookTitle,
    label: part.label,
    startPage: part.startPage,
    endPage: part.endPage,
    url: `${SITE_URL}${readAlongPath(community.slug, row.id)}`,
  });
  const gate = await prepareCommunityPost({ communityId: row.communityId, userId: row.createdById, content });
  if (!gate.ok) return { ok: false, reason: 'gate_refused' };
  if (gate.held || gate.flagRule) return { ok: false, reason: 'held_by_automod' };

  const draft = await prisma.scheduledPost.create({
    data: {
      userId: row.createdById,
      content,
      contentWarning: spoilerWarning(part.label),
      communityId: row.communityId,
      scheduledAt: now,
    },
  });
  let postId: string | null = null;
  try {
    postId = await publishScheduledPost(draft);
  } finally {
    if (!postId) {
      // A sanction landed in between (or publishing failed): never leave the row in the moderator's drafts.
      await prisma.scheduledPost
        .deleteMany({ where: { id: draft.id, publishedId: null } })
        .catch((e: unknown) => console.error('[read-along] draft cleanup error:', e));
    }
  }
  if (!postId) return { ok: false, reason: 'author_sanctioned' };
  return { ok: true, postId };
}

/**
 * Pause a read-along that cannot post. A compare-and-set on `status`, so a retry or a second runner pauses it once.
 */
export async function pauseReadAlong(id: string, reason: PauseReason): Promise<boolean> {
  const { count } = await prisma.readAlong.updateMany({
    where: { id, status: 'active' },
    data: { status: 'paused', pausedReason: reason },
  });
  return count === 1;
}

// ─── Account deletion and export ────────────────────────────────────────────────────────────────────────────────

/**
 * Account deletion, the read before the transaction: the communities whose read-alongs the member started and who
 * owns each. Anything that comes back as something else than a list is read as "none".
 */
export async function readAlongHandoverTargets(userId: string): Promise<{ id: string; createdById: string }[]> {
  const mine = await prisma.readAlong.findMany({
    where: { createdById: userId },
    select: { communityId: true },
    distinct: ['communityId'],
  });
  const communityIds = Array.isArray(mine) ? mine.map((m) => m.communityId) : [];
  if (communityIds.length === 0) return [];
  const communities = await prisma.community.findMany({
    where: { id: { in: communityIds } },
    select: { id: true, createdById: true },
  });
  return Array.isArray(communities) ? communities : [];
}

/**
 * Account deletion: the member's reader rows are erased. A read-along they started passes to the community's owner,
 * paused, so the community keeps its schedule; when they owned the community, or it has none, the read-along is
 * cancelled and its unposted parts deleted. Prisma operations only, in foreign-key order, for the one transaction.
 */
export function readAlongErasureOps(userId: string, communities: readonly { id: string; createdById: string }[]) {
  const reassign = (Array.isArray(communities) ? communities : []).filter((c) => c.createdById !== userId);
  return [
    prisma.readAlongReader.deleteMany({ where: { userId } }),
    ...reassign.flatMap((c) => [
      // Still running: handed over and paused, so nothing posts until a moderator resumes it.
      prisma.readAlong.updateMany({
        where: { createdById: userId, communityId: c.id, status: { in: ['active', 'paused'] } },
        data: { createdById: c.createdById, status: 'paused', pausedReason: 'author_not_moderator' },
      }),
      // Over already: only the reference changes.
      prisma.readAlong.updateMany({
        where: { createdById: userId, communityId: c.id },
        data: { createdById: c.createdById },
      }),
    ]),
    // What is left (the member owned the community, or it has no owner): nothing more is posted.
    prisma.readAlongPart.deleteMany({
      where: { postedAt: null, readAlong: { createdById: userId, status: { in: ['active', 'paused'] } } },
    }),
    prisma.readAlong.updateMany({
      where: { createdById: userId, status: { in: ['active', 'paused'] } },
      data: { status: 'cancelled', pausedReason: null },
    }),
  ];
}

/** The account export: the read-alongs the member started (with their parts) and the member's own reader rows. */
export async function exportReadAlongs(userId: string) {
  const [started, readers] = await Promise.all([
    prisma.readAlong.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { parts: { orderBy: { position: 'asc' } } },
    }),
    prisma.readAlongReader.findMany({
      where: { userId },
      orderBy: { joinedAt: 'asc' },
      take: 1000,
      select: { readAlongId: true, notify: true, lastPartDone: true, joinedAt: true },
    }),
  ]);
  return {
    started: started.map((r) => ({
      id: r.id,
      communityId: r.communityId,
      docSlug: r.docSlug,
      bookTitle: r.bookTitle,
      weekday: r.weekday,
      time: formatTime(r.minuteOfDay),
      timeZone: r.timeZone,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      parts: r.parts.map((p) => ({
        position: p.position,
        label: p.label,
        startPage: p.startPage,
        endPage: p.endPage,
        opensAt: p.opensAt.toISOString(),
        postedAt: p.postedAt ? p.postedAt.toISOString() : null,
      })),
    })),
    readers: readers.map((r) => ({
      readAlongId: r.readAlongId,
      notify: r.notify,
      lastPartDone: r.lastPartDone,
      joinedAt: r.joinedAt.toISOString(),
    })),
  };
}

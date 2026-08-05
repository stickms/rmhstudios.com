/**
 * The public request board (F22) — service layer.
 *
 * `Feedback` already collected input into a queue nobody outside the team could
 * see, which is why the same request arrived fifty times: a user could not tell
 * whether theirs was received, whether anyone else wanted it, or whether it had
 * already been declined. This module makes requests first-class objects with
 * votes, a status and — the part that actually matters — a required official
 * reply on the two statuses that close a conversation.
 *
 * Everything that mutates a request goes through here rather than through a
 * route handler, because the `SHIPPED`/`DECLINED` ⇒ `officialNote` invariant
 * cannot be expressed in the schema (Postgres has no conditional NOT NULL) and
 * therefore has exactly one place it can be enforced.
 */

import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { createNotification } from '@/lib/notifications.server';
import {
  STATUS_ERROR_MESSAGE,
  isVotable,
  validateStatusNote,
  type RequestStatus,
  type RequestSort,
} from '@/lib/requests/status';
import type { FeatureRequestDTO, RequestBoardPage } from '@/lib/requests/schema';
import { REQUEST_STATUSES } from '@/lib/requests/status';

/** Typed failure; API routes map `code` → HTTP status. */
export class RequestBoardError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT',
  ) {
    super(message);
    this.name = 'RequestBoardError';
  }
}

/* -------------------------------------------------------------------------- */
/* Serialisation                                                              */
/* -------------------------------------------------------------------------- */

type AuthorRow = Parameters<typeof resolveUser>[0];

type RequestRow = {
  id: string;
  title: string;
  body: string;
  status: string;
  officialNote: string | null;
  mergedIntoId: string | null;
  voteCount: number;
  createdAt: Date;
  mergedInto?: { title: string } | null;
  author?: AuthorRow | null;
};

function toDTO(row: RequestRow, viewerVoted: boolean): FeatureRequestDTO {
  const author = row.author ? resolveUser(row.author) : null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status as RequestStatus,
    officialNote: row.officialNote,
    mergedIntoId: row.mergedIntoId,
    mergedIntoTitle: row.mergedInto?.title ?? null,
    voteCount: row.voteCount,
    createdAt: row.createdAt.toISOString(),
    hasVoted: viewerVoted,
    author: author
      ? { id: author.id, name: author.name, handle: author.handle, image: author.image }
      : null,
  };
}

const listInclude = {
  author: { select: userDisplaySelect },
  mergedInto: { select: { title: true } },
} as const;

/**
 * Board ordering.
 *
 * `top` breaks ties by recency rather than by id: two requests with one vote
 * each should not be frozen in cuid order forever, because the newer one has
 * had less time to collect votes and burying it is how a board ossifies around
 * whatever was posted in its first week.
 */
function orderFor(sort: RequestSort) {
  if (sort === 'new') return [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  if (sort === 'status') {
    return [{ status: 'asc' as const }, { voteCount: 'desc' as const }, { id: 'desc' as const }];
  }
  return [{ voteCount: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }];
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface ListRequestsOptions {
  status?: RequestStatus;
  sort?: RequestSort;
  q?: string;
  /** Offset-encoded cursor (`"<n>"`). Small board; keyset is not worth it yet. */
  cursor?: string;
  limit?: number;
  viewerId?: string | null;
}

/**
 * A page of the board plus per-status counts.
 *
 * Merged duplicates are hidden from the default listing: they carry no votes of
 * their own (a merge moves them) and showing both halves of a duplicate pair is
 * exactly the confusion the merge existed to remove. They stay reachable by id.
 */
export async function listRequests(options: ListRequestsOptions = {}): Promise<RequestBoardPage> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const skip = Number.parseInt(options.cursor ?? '0', 10) || 0;
  const sort = options.sort ?? 'top';

  const where = {
    mergedIntoId: null,
    ...(options.status ? { status: options.status } : {}),
    ...(options.q
      ? {
          OR: [
            { title: { contains: options.q, mode: 'insensitive' as const } },
            { body: { contains: options.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [rows, grouped] = await Promise.all([
    prisma.featureRequest.findMany({
      where,
      include: listInclude,
      orderBy: orderFor(sort),
      skip,
      take: limit + 1,
    }),
    prisma.featureRequest.groupBy({
      by: ['status'],
      where: { mergedIntoId: null },
      _count: { _all: true },
    }),
  ]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const voted = await votedIdsFor(
    options.viewerId ?? null,
    page.map((r) => r.id),
  );

  const counts = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<
    RequestStatus,
    number
  >;
  for (const g of grouped) counts[g.status as RequestStatus] = g._count._all;

  return {
    requests: page.map((row) => toDTO(row, voted.has(row.id))),
    nextCursor: hasMore ? String(skip + limit) : null,
    counts,
  };
}

/** Which of `requestIds` the viewer has voted on — one query, never an N+1. */
async function votedIdsFor(viewerId: string | null, requestIds: string[]): Promise<Set<string>> {
  if (!viewerId || requestIds.length === 0) return new Set();
  const rows = await prisma.featureRequestVote.findMany({
    where: { userId: viewerId, requestId: { in: requestIds } },
    select: { requestId: true },
  });
  return new Set(rows.map((r) => r.requestId));
}

export async function getRequest(
  id: string,
  viewerId: string | null,
): Promise<FeatureRequestDTO | null> {
  const row = await prisma.featureRequest.findUnique({ where: { id }, include: listInclude });
  if (!row) return null;
  const voted = await votedIdsFor(viewerId, [row.id]);
  return toDTO(row, voted.has(row.id));
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * File a request. The author's own vote is cast atomically with the row —
 * "I want this" is implicit in filing it, and a board where the author has to
 * remember to upvote their own request reports the wrong numbers.
 */
export async function createRequest(
  authorId: string,
  input: { title: string; body: string },
): Promise<FeatureRequestDTO> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) throw new RequestBoardError('Title and description are required', 'INVALID');

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.featureRequest.create({
      data: { authorId, title, body, voteCount: 1 },
    });
    await tx.featureRequestVote.create({ data: { requestId: created.id, userId: authorId } });
    return tx.featureRequest.findUniqueOrThrow({
      where: { id: created.id },
      include: listInclude,
    });
  });

  return toDTO(row, true);
}

/**
 * Toggle the viewer's vote. One vote per user — enforced by the composite PK,
 * so a double-click races into a unique violation rather than two votes.
 *
 * **Votes follow a merge target.** Voting on a duplicate credits the request it
 * was merged into, which is the only behaviour that makes merging safe: if a
 * merge stranded the votes on the dead row, merging would silently destroy the
 * signal the board exists to collect.
 */
export async function toggleVote(
  userId: string,
  requestId: string,
): Promise<{ requestId: string; voteCount: number; hasVoted: boolean }> {
  const target = await resolveVoteTarget(requestId);

  if (!isVotable(target)) {
    throw new RequestBoardError('This request is closed to new votes', 'CONFLICT');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.featureRequestVote.findUnique({
      where: { requestId_userId: { requestId: target.id, userId } },
      select: { userId: true },
    });

    if (existing) {
      await tx.featureRequestVote.delete({
        where: { requestId_userId: { requestId: target.id, userId } },
      });
      const updated = await tx.featureRequest.update({
        where: { id: target.id },
        data: { voteCount: { decrement: 1 } },
        select: { voteCount: true },
      });
      return { requestId: target.id, voteCount: Math.max(0, updated.voteCount), hasVoted: false };
    }

    await tx.featureRequestVote.create({ data: { requestId: target.id, userId } });
    const updated = await tx.featureRequest.update({
      where: { id: target.id },
      data: { voteCount: { increment: 1 } },
      select: { voteCount: true },
    });
    return { requestId: target.id, voteCount: updated.voteCount, hasVoted: true };
  });
}

/**
 * Walk the merge chain to the live request a vote should land on.
 *
 * Bounded: a merge cycle (A→B→A) created by two admins racing would otherwise
 * spin forever inside a request handler. Ten hops is far past any real chain.
 */
const MAX_MERGE_HOPS = 10;

async function resolveVoteTarget(
  requestId: string,
): Promise<{ id: string; status: RequestStatus; mergedIntoId: string | null }> {
  const start = await prisma.featureRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, mergedIntoId: true },
  });
  if (!start) throw new RequestBoardError('Request not found', 'NOT_FOUND');

  // Held in a non-nullable local: reassigning the `findUnique` result directly
  // would widen the variable back to `T | null` on every hop and lose the
  // narrowing the throw above just established.
  type MergeNode = NonNullable<typeof start>;
  let current: MergeNode = start;

  const seen = new Set<string>([current.id]);
  for (let hop = 0; hop < MAX_MERGE_HOPS && current.mergedIntoId; hop++) {
    if (seen.has(current.mergedIntoId)) break;
    const next: MergeNode | null = await prisma.featureRequest.findUnique({
      where: { id: current.mergedIntoId },
      select: { id: true, status: true, mergedIntoId: true },
    });
    if (!next) break;
    seen.add(next.id);
    current = next;
  }

  return {
    id: current.id,
    status: current.status as RequestStatus,
    mergedIntoId: current.mergedIntoId,
  };
}

/**
 * Admin update: status, official reply, and/or merge target.
 *
 * The invariant is checked against the status the row will END UP with, not the
 * one that arrived in the payload — clearing the note on an already-declined
 * request is the same violation as declining without one, and only comparing
 * against the resulting state catches both.
 */
export async function updateRequest(
  adminId: string,
  requestId: string,
  input: { status?: RequestStatus; officialNote?: string | null; mergedIntoId?: string | null },
): Promise<FeatureRequestDTO> {
  const existing = await prisma.featureRequest.findUnique({
    where: { id: requestId },
    select: { id: true, authorId: true, status: true, officialNote: true, title: true },
  });
  if (!existing) throw new RequestBoardError('Request not found', 'NOT_FOUND');

  const nextStatus = input.status ?? (existing.status as RequestStatus);
  const nextNote =
    input.officialNote === undefined
      ? existing.officialNote
      : input.officialNote === null
        ? null
        : input.officialNote.trim();

  const problem = validateStatusNote(nextStatus, nextNote);
  if (problem) throw new RequestBoardError(STATUS_ERROR_MESSAGE[problem], 'INVALID');

  if (input.mergedIntoId) {
    if (input.mergedIntoId === requestId) {
      throw new RequestBoardError('A request cannot be merged into itself', 'INVALID');
    }
    const target = await prisma.featureRequest.findUnique({
      where: { id: input.mergedIntoId },
      select: { id: true, mergedIntoId: true },
    });
    if (!target) throw new RequestBoardError('Merge target not found', 'NOT_FOUND');
    if (target.mergedIntoId === requestId) {
      throw new RequestBoardError('That merge would create a loop', 'CONFLICT');
    }
  }

  const row = await prisma.$transaction(async (tx) => {
    if (input.mergedIntoId) {
      await moveVotes(tx, requestId, input.mergedIntoId);
    }
    await tx.featureRequest.update({
      where: { id: requestId },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.officialNote === undefined ? {} : { officialNote: nextNote }),
        ...(input.mergedIntoId === undefined ? {} : { mergedIntoId: input.mergedIntoId }),
      },
    });
    return tx.featureRequest.findUniqueOrThrow({ where: { id: requestId }, include: listInclude });
  });

  // Telling the author is the difference between a reply and a filing cabinet.
  if (input.status && input.status !== existing.status) {
    void createNotification({
      userId: existing.authorId,
      actorId: adminId,
      type: 'SYSTEM',
      entityType: 'request',
      entityId: requestId,
      preview: `Your request "${existing.title}" is now ${input.status.toLowerCase().replace('_', ' ')}`,
      link: `/roadmap?request=${requestId}`,
    }).catch(() => {});
  }

  return toDTO(row, false);
}

/**
 * Move every vote from a duplicate onto its merge target, skipping people who
 * already voted for the target (the composite PK would otherwise reject the
 * whole batch, and a user who wanted the thing twice still gets one vote).
 */
async function moveVotes(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  fromId: string,
  toId: string,
): Promise<void> {
  const [fromVotes, toVotes] = await Promise.all([
    tx.featureRequestVote.findMany({ where: { requestId: fromId }, select: { userId: true } }),
    tx.featureRequestVote.findMany({ where: { requestId: toId }, select: { userId: true } }),
  ]);
  const already = new Set(toVotes.map((v) => v.userId));
  const moving = fromVotes.filter((v) => !already.has(v.userId));

  if (moving.length > 0) {
    await tx.featureRequestVote.createMany({
      data: moving.map((v) => ({ requestId: toId, userId: v.userId })),
      skipDuplicates: true,
    });
  }
  await tx.featureRequestVote.deleteMany({ where: { requestId: fromId } });

  // Recount rather than increment: the counter is denormalised and a merge is
  // exactly the operation where drift would become permanent.
  const total = await tx.featureRequestVote.count({ where: { requestId: toId } });
  await tx.featureRequest.update({ where: { id: toId }, data: { voteCount: total } });
  await tx.featureRequest.update({ where: { id: fromId }, data: { voteCount: 0 } });
}

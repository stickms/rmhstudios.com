/**
 * "Blocked and muted" (sprint 05 #14), server side: the member's own block and mute lists, and their erasure and
 * export. Reads only ever the caller's rows (`blockerId` / `muterId` is the session's id, never a request value).
 * Changing a block or mute stays in `moderation.block.server.ts` / `moderation.mute.server.ts`, which also clear
 * caches and follow events; nothing here writes those tables.
 *
 * `.server.ts`: never import from a component.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { decodeCursor, encodeCursor } from '@/lib/feed/cursor';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { BLOCKED_MUTED_PAGE_SIZE, type BlockedMutedTab } from '@/lib/moderation/blocked-muted-schema';
import type { BlockedMutedPage, BlockedMutedRow } from '@/lib/moderation/blocked-muted.contract';

/** `anonymizeAccount` writes this name and clears the handle. */
const TOMBSTONE_NAME = 'Deleted user';

/** A bad `after` token: the endpoint answers 400. */
export class BlockedMutedCursorError extends Error {
  constructor() {
    super('invalid cursor');
    this.name = 'BlockedMutedCursorError';
  }
}

interface PersonRow {
  id: string;
  name: string | null;
  handle?: string | null;
}

function isDeletedAccount(user: PersonRow): boolean {
  return user.id === DELETED_USER_ID || (user.name === TOMBSTONE_NAME && (user.handle ?? null) === null);
}

/** A deleted account shows nothing of itself; the id stays because the unblock call needs it. */
function toRow(user: Parameters<typeof resolveUser>[0], since: Date): BlockedMutedRow {
  if (isDeletedAccount(user)) {
    return { userId: user.id, deleted: true, name: null, handle: null, image: null, since: since.toISOString() };
  }
  const resolved = resolveUser(user);
  return {
    userId: resolved.id,
    deleted: false,
    name: resolved.name,
    handle: resolved.handle,
    image: resolved.image ?? null,
    since: since.toISOString(),
  };
}

/** Prefix, case-insensitive, on the account name, the display name and the handle (a leading `@` is ignored). */
function personFilter(q: string | undefined): Prisma.UserWhereInput | undefined {
  const text = (q ?? '').trim().replace(/^@/, '');
  if (!text) return undefined;
  const starts = { startsWith: text, mode: 'insensitive' as const };
  return { OR: [{ name: starts }, { handle: starts }, { profile: { is: { displayName: starts } } }] };
}

type Keyset = { OR: { createdAt: Date | { lt: Date }; id?: { lt: string } }[] };

function keyset(after: string | undefined): Keyset | undefined {
  if (!after) return undefined;
  const cursor = decodeCursor(after);
  if (!cursor) throw new BlockedMutedCursorError();
  return {
    OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
  };
}

async function counts(userId: string): Promise<BlockedMutedPage['counts']> {
  const [blocked, muted] = await Promise.all([
    prisma.userBlock.count({ where: { blockerId: userId } }),
    prisma.userMute.count({ where: { muterId: userId } }),
  ]);
  return { blocked, muted };
}

function pageOf<T extends { id: string; createdAt: Date }>(
  rows: T[],
): { page: T[]; nextCursor: string | null } {
  const hasMore = rows.length > BLOCKED_MUTED_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, BLOCKED_MUTED_PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  return { page, nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null };
}

export interface ListOptions {
  q?: string | undefined;
  after?: string | undefined;
}

/** The accounts `userId` blocked, newest first. */
export async function listBlocked(userId: string, opts: ListOptions = {}): Promise<BlockedMutedPage> {
  const person = personFilter(opts.q);
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: userId, ...keyset(opts.after), ...(person ? { blocked: person } : {}) },
    select: { id: true, createdAt: true, blocked: { select: userDisplaySelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: BLOCKED_MUTED_PAGE_SIZE + 1,
  });
  const { page, nextCursor } = pageOf(rows);
  return {
    tab: 'blocked',
    items: page.map((r) => toRow(r.blocked, r.createdAt)),
    nextCursor,
    counts: await counts(userId),
  };
}

/** The accounts `userId` muted, newest first. */
export async function listMuted(userId: string, opts: ListOptions = {}): Promise<BlockedMutedPage> {
  const person = personFilter(opts.q);
  const rows = await prisma.userMute.findMany({
    where: { muterId: userId, ...keyset(opts.after), ...(person ? { muted: person } : {}) },
    select: { id: true, createdAt: true, muted: { select: userDisplaySelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: BLOCKED_MUTED_PAGE_SIZE + 1,
  });
  const { page, nextCursor } = pageOf(rows);
  return {
    tab: 'muted',
    items: page.map((r) => toRow(r.muted, r.createdAt)),
    nextCursor,
    counts: await counts(userId),
  };
}

export function listBlockedMuted(userId: string, tab: BlockedMutedTab, opts: ListOptions = {}): Promise<BlockedMutedPage> {
  return tab === 'muted' ? listMuted(userId, opts) : listBlocked(userId, opts);
}

/**
 * Erasure: the member's OWN block and mute lists. Rows where someone else blocked or muted the member are those
 * members' safety decisions and stay. Prisma operations only, for `anonymizeAccount`'s transaction.
 */
export function blockMuteErasureOps(userId: string) {
  return [
    prisma.userBlock.deleteMany({ where: { blockerId: userId } }),
    prisma.userMute.deleteMany({ where: { muterId: userId } }),
  ];
}

export interface BlocksMutesExport {
  blocked: { userId: string; handle: string | null; since: string }[];
  muted: { userId: string; handle: string | null; since: string }[];
}

/** The member's own block and mute lists for the account export: who, and since when. */
export async function exportBlocksMutes(userId: string): Promise<BlocksMutesExport> {
  const [blocks, mutes] = await Promise.all([
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      select: { blockedId: true, createdAt: true, blocked: { select: { handle: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.userMute.findMany({
      where: { muterId: userId },
      select: { mutedId: true, createdAt: true, muted: { select: { handle: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
  ]);
  return {
    blocked: blocks.map((b) => ({ userId: b.blockedId, handle: b.blocked.handle, since: b.createdAt.toISOString() })),
    muted: mutes.map((m) => ({ userId: m.mutedId, handle: m.muted.handle, since: m.createdAt.toISOString() })),
  };
}

/**
 * Game jam teams, the server half (s05-15; the rules and refusal codes are in `jam-teams.ts`).
 *
 * The submitter owns the entry and invites up to three teammates while submissions are open. A member is on
 * one entry per jam (as submitter or accepted teammate), so every write that places a member (an invitation,
 * an accept, a submission) takes `jam-team:<jam>:<member>` first and checks the placement inside the
 * transaction; the cap takes `jam-entry-team:<entry>`. Locks are always taken member first, entry second.
 * An accept claims its invitation with a conditional update, so it flips once and notifies once. After
 * `submitEndsAt` every write is refused: results never change owners once rating starts.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { createNotification } from '@/lib/notifications.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { canSubmit, jamPhase } from '@/lib/competitive/jam';
import {
  conflictingPlacement,
  hasTeamRoom,
  MAX_TEAMMATES,
  personLabel,
  type TeamEntryDTO,
  type TeamRefusal,
} from '@/lib/competitive/jam-teams';

export type TeamResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: TeamRefusal; entryTitle?: string };

const refuse = (code: TeamRefusal, entryTitle?: string): { ok: false; code: TeamRefusal; entryTitle?: string } =>
  entryTitle === undefined ? { ok: false, code } : { ok: false, code, entryTitle };

interface Refused {
  code: TeamRefusal;
  entryTitle?: string;
}

const TEAM_ENTITY = 'jam_team';

/** The lock that places one member in one jam (an invitation, an accept, a submission, a rating). */
export const memberLockName = (jamId: string, userId: string): string => `jam-team:${jamId}:${userId}`;

const entryLockName = (entryId: string): string => `jam-entry-team:${entryId}`;

interface EntryFacts {
  id: string;
  userId: string;
  jamId: string;
  title: string;
  jam: { slug: string; title: string; startsAt: Date; submitEndsAt: Date; ratingEndsAt: Date };
}

async function readEntry(
  db: Pick<Prisma.TransactionClient, 'gameJamEntry'>,
  slug: string,
  entryId: string,
): Promise<EntryFacts | null> {
  const row = await db.gameJamEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      userId: true,
      jamId: true,
      build: { select: { title: true } },
      jam: { select: { slug: true, title: true, startsAt: true, submitEndsAt: true, ratingEndsAt: true } },
    },
  });
  if (!row || row.jam.slug !== slug) return null;
  return { id: row.id, userId: row.userId, jamId: row.jamId, title: row.build.title, jam: row.jam };
}

const isOpen = (jam: EntryFacts['jam']): boolean => canSubmit(jamPhase(jam, new Date()));

/**
 * The entries `userId` is already on in this jam: the one they submitted and any they accepted. At most one
 * exists while the rule holds; the list form lets `conflictingPlacement` name the first that is not `entryId`.
 */
export async function placementsOf(
  tx: Pick<Prisma.TransactionClient, 'gameJamEntry' | 'gameJamTeamMember'>,
  jamId: string,
  userId: string,
): Promise<{ entryId: string; title: string }[]> {
  const [own, accepted] = await Promise.all([
    tx.gameJamEntry.findUnique({
      where: { jamId_userId: { jamId, userId } },
      select: { id: true, build: { select: { title: true } } },
    }),
    tx.gameJamTeamMember.findMany({
      where: { jamId, userId, status: 'accepted' },
      select: { entryId: true, entry: { select: { build: { select: { title: true } } } } },
    }),
  ]);
  return [
    ...(own ? [{ entryId: own.id, title: own.build.title }] : []),
    ...accepted.map((a) => ({ entryId: a.entryId, title: a.entry.build.title })),
  ];
}

async function blockedEitherWay(tx: Pick<Prisma.TransactionClient, 'userBlock'>, a: string, b: string): Promise<boolean> {
  const hit = await tx.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

/** Why `userId` cannot be on this entry's team right now (banned, blocked either way with the submitter), or null. */
async function ineligibility(
  tx: Prisma.TransactionClient,
  entry: EntryFacts,
  userId: string,
  now: Date,
): Promise<'user-not-found' | 'banned' | 'blocked' | null> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, bannedUntil: true } });
  if (!user) return 'user-not-found';
  if (user.bannedUntil && user.bannedUntil.getTime() > now.getTime()) return 'banned';
  if (await blockedEitherWay(tx, entry.userId, userId)) return 'blocked';
  return null;
}

const displayName = (u: Parameters<typeof resolveUser>[0] | null): string =>
  (u ? personLabel(resolveUser(u)) : null) ?? 'A member';

async function notifySafely(input: Parameters<typeof createNotification>[0]): Promise<void> {
  try {
    await createNotification(input);
  } catch (err) {
    console.error('[jam-teams] notification failed:', err);
  }
}

const rowSelect = {
  status: true,
  invitedAt: true,
  user: { select: userDisplaySelect },
} as const satisfies Prisma.GameJamTeamMemberSelect;

type Row = Prisma.GameJamTeamMemberGetPayload<{ select: typeof rowSelect }>;

function toEntry(row: Row): TeamEntryDTO {
  const u = resolveUser(row.user);
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    image: u.image,
    status: row.status === 'accepted' ? 'accepted' : 'invited',
    invitedAt: row.invitedAt.toISOString(),
  };
}

/** The submitter invites `userId`. Repeating an invitation (or inviting an existing teammate) changes and notifies nothing. */
export async function inviteTeammate(input: {
  slug: string;
  entryId: string;
  actorId: string;
  userId: string;
}): Promise<TeamResult<TeamEntryDTO>> {
  const entry = await readEntry(prisma, input.slug, input.entryId);
  if (!entry) return refuse('not-found');
  if (entry.userId !== input.actorId) return refuse('not-owner');
  if (input.userId === entry.userId) return refuse('self');

  const outcome = await prisma.$transaction(async (tx): Promise<Refused | { entry: TeamEntryDTO; created: boolean }> => {
    await lockKey(tx, memberLockName(entry.jamId, input.userId));
    await lockKey(tx, entryLockName(entry.id));
    if (!isOpen(entry.jam)) return { code: 'closed' as const };
    const existing = await tx.gameJamTeamMember.findUnique({
      where: { entryId_userId: { entryId: entry.id, userId: input.userId } },
      select: rowSelect,
    });
    if (existing) return { entry: toEntry(existing), created: false };
    const refused = await ineligibility(tx, entry, input.userId, new Date());
    if (refused) return { code: refused };
    const placed = conflictingPlacement(await placementsOf(tx, entry.jamId, input.userId), entry.id);
    if (placed) return { code: 'already-on-entry' as const, entryTitle: placed.title };
    const rows = await tx.gameJamTeamMember.count({ where: { entryId: entry.id } });
    if (!hasTeamRoom(rows)) return { code: 'full' as const };
    const created = await tx.gameJamTeamMember.create({
      data: { entryId: entry.id, userId: input.userId, jamId: entry.jamId, status: 'invited' },
      select: rowSelect,
    });
    return { entry: toEntry(created), created: true };
  });
  if ('code' in outcome) return refuse(outcome.code, outcome.entryTitle);

  if (outcome.created) {
    const owner = await prisma.user.findUnique({ where: { id: input.actorId }, select: userDisplaySelect });
    await notifySafely({
      userId: input.userId,
      actorId: input.actorId,
      type: 'SYSTEM',
      entityType: TEAM_ENTITY,
      entityId: entry.id,
      preview: `${displayName(owner)} added you to their entry in ${entry.jam.title}`,
      link: `/jams/${entry.jam.slug}`,
    });
  }
  return { ok: true, value: outcome.entry };
}

/**
 * The invited member answers. Accepting puts them on the team (re-checking, inside the lock, that the pair is
 * still unblocked, they are not banned and they are on no other entry of the jam), drops their other pending
 * invitations in the jam and any rating they gave this entry, and tells the submitter. Declining deletes the
 * invitation so the submitter may ask again. Accepting twice is a no-op; a teammate cannot "decline".
 */
export async function respondToTeamInvite(input: {
  slug: string;
  entryId: string;
  userId: string;
  accept: boolean;
}): Promise<TeamResult<{ accept: boolean }>> {
  const entry = await readEntry(prisma, input.slug, input.entryId);
  if (!entry) return refuse('not-found');

  const outcome = await prisma.$transaction(async (tx): Promise<{ refused?: Refused; notify: boolean }> => {
    await lockKey(tx, memberLockName(entry.jamId, input.userId));
    const mine = await tx.gameJamTeamMember.findUnique({
      where: { entryId_userId: { entryId: entry.id, userId: input.userId } },
      select: { status: true },
    });
    if (!mine) return { refused: { code: 'no-invite' }, notify: false };
    if (!isOpen(entry.jam)) return { refused: { code: 'closed' }, notify: false };
    if (mine.status === 'accepted') {
      return input.accept ? { notify: false } : { refused: { code: 'already-accepted' }, notify: false };
    }
    if (!input.accept) {
      await tx.gameJamTeamMember.deleteMany({
        where: { entryId: entry.id, userId: input.userId, status: 'invited' },
      });
      return { notify: false };
    }
    const refused = await ineligibility(tx, entry, input.userId, new Date());
    if (refused) return { refused: { code: refused }, notify: false };
    const placed = conflictingPlacement(await placementsOf(tx, entry.jamId, input.userId), entry.id);
    if (placed) return { refused: { code: 'already-on-entry', entryTitle: placed.title }, notify: false };
    const flipped = await tx.gameJamTeamMember.updateMany({
      where: { entryId: entry.id, userId: input.userId, status: 'invited' },
      data: { status: 'accepted', respondedAt: new Date() },
    });
    if (flipped.count === 1) {
      await tx.gameJamTeamMember.deleteMany({
        where: { jamId: entry.jamId, userId: input.userId, status: 'invited', entryId: { not: entry.id } },
      });
      await tx.gameJamRating.deleteMany({ where: { entryId: entry.id, raterId: input.userId } });
    }
    return { notify: flipped.count === 1 };
  });
  if (outcome.refused) return refuse(outcome.refused.code, outcome.refused.entryTitle);

  if (outcome.notify) {
    const me = await prisma.user.findUnique({ where: { id: input.userId }, select: userDisplaySelect });
    await notifySafely({
      userId: entry.userId,
      actorId: input.userId,
      type: 'SYSTEM',
      entityType: TEAM_ENTITY,
      entityId: entry.id,
      preview: `${displayName(me)} joined your entry in ${entry.jam.title}`,
      link: `/jams/${entry.jam.slug}`,
    });
  }
  return { ok: true, value: { accept: input.accept } };
}

/** The submitter removes a teammate or withdraws an invitation. Nobody is notified; a row already gone succeeds. */
export async function removeTeammate(input: {
  slug: string;
  entryId: string;
  actorId: string;
  userId: string;
}): Promise<TeamResult<true>> {
  const entry = await readEntry(prisma, input.slug, input.entryId);
  if (!entry) return refuse('not-found');
  if (entry.userId !== input.actorId) return refuse('not-owner');
  return deleteRow(entry, input.userId);
}

/** A member leaves the team (or declines from the panel): their own row, whatever its status. */
export async function leaveTeam(input: { slug: string; entryId: string; userId: string }): Promise<TeamResult<true>> {
  const entry = await readEntry(prisma, input.slug, input.entryId);
  if (!entry) return refuse('not-found');
  return deleteRow(entry, input.userId);
}

async function deleteRow(entry: EntryFacts, userId: string): Promise<TeamResult<true>> {
  const closed = await prisma.$transaction(async (tx) => {
    await lockKey(tx, entryLockName(entry.id));
    if (!isOpen(entry.jam)) return true;
    await tx.gameJamTeamMember.deleteMany({ where: { entryId: entry.id, userId } });
    return false;
  });
  return closed ? refuse('closed') : { ok: true, value: true };
}

/**
 * The team as the viewer may read it: everyone sees the accepted teammates; the submitter also sees the pending
 * invitations, and an invited member sees their own. The submitter is not a row.
 */
export async function listTeam(input: {
  slug: string;
  entryId: string;
  actorId: string | null;
}): Promise<TeamResult<TeamEntryDTO[]>> {
  const entry = await readEntry(prisma, input.slug, input.entryId);
  if (!entry) return refuse('not-found');
  const visible: Prisma.GameJamTeamMemberWhereInput[] = [{ status: 'accepted' }];
  if (input.actorId === entry.userId) visible.push({ status: 'invited' });
  else if (input.actorId) visible.push({ userId: input.actorId });
  const rows = await prisma.gameJamTeamMember.findMany({
    where: { entryId: entry.id, OR: visible },
    orderBy: [{ invitedAt: 'asc' }, { userId: 'asc' }],
    take: MAX_TEAMMATES,
    select: rowSelect,
  });
  return { ok: true, value: rows.map(toEntry) };
}

/**
 * Account erasure operations (the cascade never fires on an anonymised account): the member's own team rows, and
 * the invitations still pending on entries they submitted. The entry itself stays (published content), with its
 * submitter de-identified; teammates who accepted stay credited on it.
 */
export function jamTeamErasureOps(userId: string) {
  return [
    prisma.gameJamTeamMember.deleteMany({
      where: { OR: [{ userId }, { status: 'invited', entry: { userId } }] },
    }),
  ] as const;
}

/** The data export: the jam entries the member was invited to or is credited on, with the jam named. */
export async function exportJamTeamMemberships(userId: string) {
  const rows = await prisma.gameJamTeamMember.findMany({
    where: { userId },
    orderBy: { invitedAt: 'asc' },
    take: 1000,
    select: {
      entryId: true,
      status: true,
      invitedAt: true,
      respondedAt: true,
      entry: { select: { build: { select: { title: true } }, jam: { select: { title: true } } } },
    },
  });
  return rows.map((r) => ({
    entryId: r.entryId,
    entryTitle: r.entry.build.title,
    jamTitle: r.entry.jam.title,
    status: r.status,
    invitedAt: r.invitedAt.toISOString(),
    respondedAt: r.respondedAt?.toISOString() ?? null,
  }));
}

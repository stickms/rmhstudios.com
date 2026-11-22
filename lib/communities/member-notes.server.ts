/**
 * Community moderator notes (s06-02, server-only). Private to one community's moderators and owner: the
 * only callers are the `requireMod` endpoints in `lib/communities/api/communities.$slug.notes.*`; nothing
 * here is reachable from a member-facing serializer, the public mod log, OG images or `/api/v1/**`.
 *
 * Every lookup carries `communityId` in the `where`, so a moderator of community A cannot read, edit or
 * delete a note of community B by id. The cap check and insert run under one advisory lock per
 * (community, member); the edit window is judged by the database clock in a single conditional UPDATE.
 * Notes survive the member leaving or being banned; account deletion removes the ones about them.
 */
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { logModAction } from '@/lib/communities/modlog.server';
import {
  NOTE_EDIT_WINDOW_MS,
  NOTES_PER_MEMBER_MAX,
  withinEditWindow,
  type NoteDTO,
} from '@/lib/communities/member-notes';

export type NoteFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  error: string;
};
export type NoteResult = { ok: true; note: NoteDTO } | NoteFailure;

const fail = (status: NoteFailure['status'], error: string): NoteFailure => ({ ok: false, status, error });

interface NoteRow {
  id: string;
  subjectId: string;
  authorId: string | null;
  body: string;
  banId: string | null;
  modItemId: string | null;
  createdAt: Date;
  editedAt: Date | null;
}

const NOTE_SELECT = {
  id: true,
  subjectId: true,
  authorId: true,
  body: true,
  banId: true,
  modItemId: true,
  createdAt: true,
  editedAt: true,
} as const;

const authorOf = (a: { id: string; name: string | null; handle: string | null } | undefined) =>
  a ? { id: a.id, name: a.name, handle: a.handle } : null;

async function toDTOs(rows: NoteRow[], viewerId: string): Promise<NoteDTO[]> {
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: userChipSelect,
      })
    : [];
  const byId = new Map(authors.map((a) => [a.id, a]));
  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    subjectId: r.subjectId,
    author: authorOf(byId.get(r.authorId ?? '')),
    body: r.body,
    banId: r.banId,
    modItemId: r.modItemId,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt ? r.editedAt.toISOString() : null,
    canEdit: r.authorId === viewerId && withinEditWindow(r.createdAt, now),
  }));
}

/** Live notes about one member in one community, newest first. */
export async function listNotes(communityId: string, subjectId: string, viewerId: string): Promise<NoteDTO[]> {
  const rows = await prisma.communityMemberNote.findMany({
    where: { communityId, subjectId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: NOTES_PER_MEMBER_MAX,
    select: NOTE_SELECT,
  });
  return toDTOs(rows, viewerId);
}

/**
 * Live note counts for a page of members: ONE grouped query, never one per row. Every id asked for
 * has an entry (0 when it has no notes).
 */
export async function countNotes(communityId: string, subjectIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(subjectIds.map((id) => [id, 0]));
  if (subjectIds.length === 0) return counts;
  const grouped = await prisma.communityMemberNote.groupBy({
    by: ['subjectId'],
    where: { communityId, subjectId: { in: subjectIds }, deletedAt: null },
    _count: { _all: true },
  });
  for (const g of Array.isArray(grouped) ? grouped : []) counts[g.subjectId] = g._count._all;
  return counts;
}

export interface AddNoteInput {
  communityId: string;
  subjectId: string;
  authorId: string;
  body: string;
  banId?: string | undefined;
  modItemId?: string | undefined;
}

/** Add a note. The 51st live note about a member is refused (409), under the member's advisory lock. */
export async function addNote(input: AddNoteInput): Promise<NoteResult> {
  const { communityId, subjectId, authorId } = input;
  const subject = await prisma.user.findUnique({ where: { id: subjectId }, select: { id: true } });
  if (!subject) return fail(404, 'Member not found');
  if (input.banId) {
    const ban = await prisma.communityBan.findFirst({
      where: { id: input.banId, communityId, userId: subjectId },
      select: { id: true },
    });
    if (!ban) return fail(400, 'Sanction not found');
  }
  if (input.modItemId) {
    const item = await prisma.communityModItem.findFirst({
      where: { id: input.modItemId, communityId, authorId: subjectId },
      select: { id: true },
    });
    if (!item) return fail(400, 'Queue item not found');
  }
  const row = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `community-note:${communityId}:${subjectId}`);
    const live = await tx.communityMemberNote.count({ where: { communityId, subjectId, deletedAt: null } });
    if (live >= NOTES_PER_MEMBER_MAX) return null;
    return tx.communityMemberNote.create({
      data: {
        communityId,
        subjectId,
        authorId,
        body: input.body,
        banId: input.banId ?? null,
        modItemId: input.modItemId ?? null,
      },
      select: NOTE_SELECT,
    });
  });
  if (!row) return fail(409, `A member can have at most ${NOTES_PER_MEMBER_MAX} notes`);
  const [note] = await toDTOs([row], authorId);
  return { ok: true, note: note! };
}

/**
 * Edit a note: its author only, within 15 minutes of writing, judged by the database clock in the same
 * statement that writes (`"createdAt" > now() - interval`). Table and columns are the `@@map` names.
 */
export async function editNote(input: {
  communityId: string;
  subjectId: string;
  noteId: string;
  viewerId: string;
  body: string;
}): Promise<NoteResult> {
  const existing = await prisma.communityMemberNote.findFirst({
    where: { id: input.noteId, communityId: input.communityId, subjectId: input.subjectId, deletedAt: null },
    select: { id: true, authorId: true },
  });
  if (!existing) return fail(404, 'Note not found');
  if (existing.authorId !== input.viewerId) return fail(403, 'Only the author can edit a note');
  const updated = await prisma.$queryRaw<NoteRow[]>`
    UPDATE "community_member_note"
    SET "body" = ${input.body}, "editedAt" = now()
    WHERE "id" = ${input.noteId}
      AND "communityId" = ${input.communityId}
      AND "authorId" = ${input.viewerId}
      AND "deletedAt" IS NULL
      AND "createdAt" > now() - make_interval(secs => ${NOTE_EDIT_WINDOW_MS / 1000})
    RETURNING "id", "subjectId", "authorId", "body", "banId", "modItemId", "createdAt", "editedAt"`;
  const row = Array.isArray(updated) ? updated[0] : undefined;
  if (!row) return fail(409, 'Notes can only be edited for 15 minutes after they are written');
  const [note] = await toDTOs([row], input.viewerId);
  return { ok: true, note: note! };
}

/** Soft-delete a note (any moderator) and log `note_deleted`, in one transaction. */
export async function deleteNote(input: {
  communityId: string;
  subjectId: string;
  noteId: string;
  actorId: string;
}): Promise<{ ok: true } | NoteFailure> {
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.communityMemberNote.updateMany({
      where: { id: input.noteId, communityId: input.communityId, subjectId: input.subjectId, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: input.actorId },
    });
    if (claimed.count === 0) return false;
    await logModAction(tx, {
      communityId: input.communityId,
      actorId: input.actorId,
      action: 'note_deleted',
      targetUserId: input.subjectId,
      targetType: 'member',
      targetId: input.subjectId,
    });
    return true;
  });
  return done ? { ok: true } : fail(404, 'Note not found');
}

/**
 * Account erasure (Prisma operations only, for the `$transaction([...])`): notes about the member are
 * deleted; where they were the author or the moderator who deleted, the reference is nulled.
 */
export function communityNoteErasureOps(userId: string) {
  return [
    prisma.communityMemberNote.deleteMany({ where: { subjectId: userId } }),
    prisma.communityMemberNote.updateMany({ where: { authorId: userId }, data: { authorId: null } }),
    prisma.communityMemberNote.updateMany({ where: { deletedById: userId }, data: { deletedById: null } }),
  ];
}

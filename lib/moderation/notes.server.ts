/**
 * Moderator notes (s03-04): internal, admin-only notes on a member's account. Server only.
 *
 * Nothing here is reachable from a member-facing serializer: the only callers are the `auth: 'admin'`
 * endpoints under `lib/moderation/api/admin.users.$id.notes*` and the reports queue (note counts).
 * A note is never rewritten silently (an edit keeps the previous text) and never hard-deleted by a
 * moderator (a delete is a soft delete); it goes away with the member (`anonymizeAccount`).
 * Every change writes `AdminAuditLog`, with the note's id and never its text.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { isDeletedAccount } from '@/lib/account-lifecycle';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { ModeratorNoteRow, ModeratorNotesPage, NoteLinkChoices } from '@/lib/moderation/notes.contract';
import { NOTES_PAGE_SIZE, canPinAnother, editRefusal, editWindowEnds, type EditRefusal } from '@/lib/moderation/notes';

const CHOICES_SHOWN = 25;

export type NoteFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  error: string;
};
export type NoteResult =
  | {
      ok: true;
      note: ModeratorNoteRow;
    }
  | NoteFailure;

const REFUSALS: Record<
  EditRefusal,
  {
    status: 403 | 409;
    error: string;
  }
> = {
  deleted: {
    status: 409,
    error: 'This note was deleted',
  },
  'not-author': {
    status: 403,
    error: 'Only the author can edit a note',
  },
  'window-closed': {
    status: 409,
    error: 'A note can be edited for 24 hours after it was written',
  },
  'too-many-edits': {
    status: 409,
    error: 'This note has been edited too many times; write a new one',
  },
};

const noteInclude = {
  author: {
    select: userDisplaySelect,
  },
} as const;

type NoteWithAuthor = Prisma.ModeratorNoteGetPayload<{
  include: typeof noteInclude;
}>;

/** Display rows for the people named on a page of notes (authors came with the rows; deleters are batched). */
async function deleterMap(
  notes: {
    deletedById: string | null;
  }[],
) {
  const ids = [...new Set(notes.map((n) => n.deletedById).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map<string, ReturnType<typeof resolveUser>>();
  const users = await prisma.user.findMany({
    where: {
      id: {
        in: ids,
      },
    },
    select: userDisplaySelect,
  });
  return new Map(users.map((u) => [u.id, resolveUser(u)]));
}

async function rowsFor(notes: NoteWithAuthor[], now = new Date()): Promise<ModeratorNoteRow[]> {
  const reportIds = [...new Set(notes.map((n) => n.reportId).filter((id): id is string => !!id))];
  const strikeIds = [...new Set(notes.map((n) => n.strikeId).filter((id): id is string => !!id))];
  const [reports, strikes, deleters] = await Promise.all([
    reportIds.length
      ? prisma.contentReport.findMany({
          where: {
            id: {
              in: reportIds,
            },
          },
          select: {
            id: true,
            reason: true,
            status: true,
          },
        })
      : [],
    strikeIds.length
      ? prisma.userStrike.findMany({
          where: {
            id: {
              in: strikeIds,
            },
          },
          select: {
            id: true,
            reason: true,
          },
        })
      : [],
    deleterMap(notes),
  ]);
  const reportById = new Map(reports.map((r) => [r.id, r]));
  const strikeById = new Map(strikes.map((s) => [s.id, s]));

  return notes.map((n) => {
    const deleted = n.deletedAt !== null;
    const until = editWindowEnds(n.createdAt);
    return {
      id: n.id,
      body: deleted ? null : n.body,
      editedFrom: deleted ? [] : n.editedFrom,
      pinned: n.pinned,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      author: n.author ? resolveUser(n.author) : null,
      editableUntil: !deleted && until.getTime() > now.getTime() ? until.toISOString() : null,
      report: n.reportId ? (reportById.get(n.reportId) ?? null) : null,
      strike: n.strikeId ? (strikeById.get(n.strikeId) ?? null) : null,
      deleted: deleted
        ? {
            at: n.deletedAt!.toISOString(),
            by: n.deletedById ? (deleters.get(n.deletedById) ?? null) : null,
          }
        : null,
    };
  });
}

async function linkChoices(subjectId: string): Promise<NoteLinkChoices> {
  const [reports, strikes] = await Promise.all([
    prisma.contentReport.findMany({
      where: {
        targetUserId: subjectId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: CHOICES_SHOWN,
      select: {
        id: true,
        reason: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.userStrike.findMany({
      where: {
        userId: subjectId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: CHOICES_SHOWN,
      select: {
        id: true,
        reason: true,
        createdAt: true,
      },
    }),
  ]);
  return {
    reports: reports.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    strikes: strikes.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}

/** The member the notes are about; null when there is no such member or the account was erased. */
async function liveSubject(subjectId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: subjectId,
    },
    select: {
      id: true,
      banReason: true,
    },
  });
  if (!user || isDeletedAccount(user)) return null;
  return user;
}

/** One page of a member's notes: pinned first, then newest first; `q` matches the text of live notes. */
export async function listNotes(
  subjectId: string,
  opts: {
    q?: string | undefined;
    cursor?: string | undefined;
  },
): Promise<ModeratorNotesPage | null> {
  if (!(await liveSubject(subjectId))) return null;
  const search = opts.q?.trim();
  const where: Prisma.ModeratorNoteWhereInput = {
    subjectId,
    ...(search
      ? {
          deletedAt: null,
          body: {
            contains: search,
            mode: 'insensitive',
          },
        }
      : {}),
  };
  const [rows, total, pinned, choices] = await Promise.all([
    prisma.moderatorNote.findMany({
      where,
      orderBy: [
        {
          pinned: 'desc',
        },
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take: NOTES_PAGE_SIZE + 1,
      ...(opts.cursor
        ? {
            skip: 1,
            cursor: {
              id: opts.cursor,
            },
          }
        : {}),
      include: noteInclude,
    }),
    prisma.moderatorNote.count({
      where: {
        subjectId,
        deletedAt: null,
      },
    }),
    prisma.moderatorNote.count({
      where: {
        subjectId,
        deletedAt: null,
        pinned: true,
      },
    }),
    linkChoices(subjectId),
  ]);
  const more = rows.length > NOTES_PAGE_SIZE;
  const page = more ? rows.slice(0, NOTES_PAGE_SIZE) : rows;
  return {
    notes: await rowsFor(page),
    nextCursor: more ? (page[page.length - 1]?.id ?? null) : null,
    total,
    pinned,
    choices,
  };
}

/** Add a note; a report or strike link must be one of this member's own. */
export async function createNote(input: {
  subjectId: string;
  authorId: string;
  body: string;
  reportId?: string | undefined;
  strikeId?: string | undefined;
}): Promise<NoteResult> {
  if (!(await liveSubject(input.subjectId)))
    return {
      ok: false,
      status: 404,
      error: 'User not found',
    };
  if (input.reportId) {
    const report = await prisma.contentReport.findFirst({
      where: {
        id: input.reportId,
        targetUserId: input.subjectId,
      },
      select: {
        id: true,
      },
    });
    if (!report)
      return {
        ok: false,
        status: 400,
        error: 'That report is not about this member',
      };
  }
  if (input.strikeId) {
    const strike = await prisma.userStrike.findFirst({
      where: {
        id: input.strikeId,
        userId: input.subjectId,
      },
      select: {
        id: true,
      },
    });
    if (!strike)
      return {
        ok: false,
        status: 400,
        error: 'That strike is not this member’s',
      };
  }
  const created = await prisma.moderatorNote.create({
    data: {
      subjectId: input.subjectId,
      authorId: input.authorId,
      body: input.body,
      reportId: input.reportId ?? null,
      strikeId: input.strikeId ?? null,
    },
    include: noteInclude,
  });
  await logAdminAction(input.authorId, 'user.note.create', {
    targetType: 'user',
    targetId: input.subjectId,
    detail: `note ${created.id}`,
  });
  const [note] = await rowsFor([created]);
  return {
    ok: true,
    note: note!,
  };
}

/** The note, only if it belongs to this member. */
function findOwned(subjectId: string, noteId: string) {
  return prisma.moderatorNote.findFirst({
    where: {
      id: noteId,
      subjectId,
    },
    include: noteInclude,
  });
}

/**
 * Edit the text (author only, within 24 hours, previous text kept) and/or pin or unpin (any admin, at most
 * three pinned). Text is checked first so a refused edit changes nothing.
 */
export async function updateNote(input: {
  subjectId: string;
  noteId: string;
  adminId: string;
  body?: string | undefined;
  pinned?: boolean | undefined;
}): Promise<NoteResult> {
  const note = await findOwned(input.subjectId, input.noteId);
  if (!note)
    return {
      ok: false,
      status: 404,
      error: 'Note not found',
    };
  if (note.deletedAt)
    return {
      ok: false,
      status: 409,
      error: REFUSALS.deleted.error,
    };

  const data: Prisma.ModeratorNoteUpdateInput = {};
  const actions: string[] = [];

  if (input.body !== undefined && input.body !== note.body) {
    const refusal = editRefusal({
      authorId: note.authorId,
      viewerId: input.adminId,
      createdAt: note.createdAt,
      deletedAt: note.deletedAt,
      editCount: note.editedFrom.length,
    });
    if (refusal)
      return {
        ok: false,
        ...REFUSALS[refusal],
      };
    data.body = input.body;
    data.editedFrom = {
      push: note.body,
    };
    actions.push('user.note.edit');
  }

  if (input.pinned !== undefined && input.pinned !== note.pinned) {
    if (input.pinned) {
      const pinnedNow = await prisma.moderatorNote.count({
        where: {
          subjectId: input.subjectId,
          deletedAt: null,
          pinned: true,
        },
      });
      if (!canPinAnother(pinnedNow)) {
        return {
          ok: false,
          status: 409,
          error: 'Three notes are already pinned; unpin one first',
        };
      }
    }
    data.pinned = input.pinned;
    actions.push(input.pinned ? 'user.note.pin' : 'user.note.unpin');
  }

  if (actions.length === 0) {
    const [row] = await rowsFor([note]);
    return {
      ok: true,
      note: row!,
    };
  }

  const updated = await prisma.moderatorNote.update({
    where: {
      id: note.id,
    },
    data,
    include: noteInclude,
  });
  for (const action of actions) {
    await logAdminAction(input.adminId, action, {
      targetType: 'user',
      targetId: input.subjectId,
      detail: `note ${note.id}`,
    });
  }
  const [row] = await rowsFor([updated]);
  return {
    ok: true,
    note: row!,
  };
}

/** Soft delete (any admin). A pinned note is unpinned so the pin slot frees up. */
export async function deleteNote(input: { subjectId: string; noteId: string; adminId: string }): Promise<
  | {
      ok: true;
    }
  | NoteFailure
> {
  const note = await findOwned(input.subjectId, input.noteId);
  if (!note)
    return {
      ok: false,
      status: 404,
      error: 'Note not found',
    };
  if (note.deletedAt)
    return {
      ok: false,
      status: 409,
      error: REFUSALS.deleted.error,
    };
  await prisma.moderatorNote.update({
    where: {
      id: note.id,
    },
    data: {
      deletedAt: new Date(),
      deletedById: input.adminId,
      pinned: false,
    },
  });
  await logAdminAction(input.adminId, 'user.note.delete', {
    targetType: 'user',
    targetId: input.subjectId,
    detail: `note ${note.id}`,
  });
  return {
    ok: true,
  };
}

/** Live note counts for a set of members, in one query (the reports queue). Members with none are absent. */
export async function noteCountsFor(subjectIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(subjectIds)];
  if (ids.length === 0) return new Map();
  const groups = await prisma.moderatorNote.groupBy({
    by: ['subjectId'],
    where: {
      subjectId: {
        in: ids,
      },
      deletedAt: null,
    },
    _count: {
      _all: true,
    },
  });
  return new Map(groups.map((g) => [g.subjectId, g._count._all]));
}

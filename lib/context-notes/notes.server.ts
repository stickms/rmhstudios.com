import { prisma } from '@/lib/prisma.server';
import { canViewPost } from '@/lib/feed/audience.server';
import { shouldShowNote, type RaterHistory } from './bridging';

const MAX_NOTES_PER_POST = 10;
const HELPFUL_SAMPLE = 40;
const HISTORY_ROWS = 4000;

const postGate = { id: true, userId: true, audience: true, communityId: true, deletedAt: true, expiresAt: true } as const;

async function viewablePost(postId: string, viewerId: string | null) {
  const post = await prisma.rMHark.findUnique({ where: { id: postId }, select: postGate });
  if (!post || post.deletedAt || !(await canViewPost(post, viewerId))) return null;
  return post;
}

/** Recount a note's ratings, re-run the bridging rule, and keep `rmheet.hasNote` in step. */
export async function refreshNote(noteId: string): Promise<void> {
  const note = await prisma.contextNote.findUnique({
    where: { id: noteId },
    select: { postId: true, hidden: true },
  });
  if (!note) return;
  const [groups, helpfulRows] = await Promise.all([
    prisma.contextNoteRating.groupBy({ by: ['helpful'], where: { noteId }, _count: true }),
    prisma.contextNoteRating.findMany({
      where: { noteId, helpful: true },
      orderBy: { createdAt: 'desc' },
      take: HELPFUL_SAMPLE,
      select: { raterId: true },
    }),
  ]);
  const helpfulCount = groups.find((g) => g.helpful)?._count ?? 0;
  const notCount = groups.find((g) => !g.helpful)?._count ?? 0;
  const helpfulRaters = helpfulRows.map((r) => r.raterId);

  const history: RaterHistory = new Map();
  if (helpfulRaters.length >= 3) {
    const rows = await prisma.contextNoteRating.findMany({
      where: { raterId: { in: helpfulRaters }, noteId: { not: noteId } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_ROWS,
      select: { raterId: true, noteId: true, helpful: true },
    });
    for (const r of rows) {
      let m = history.get(r.raterId);
      if (!m) history.set(r.raterId, (m = new Map()));
      m.set(r.noteId, r.helpful);
    }
  }
  const visible =
    !note.hidden && shouldShowNote({ helpfulRaters, notHelpfulCount: notCount, history });
  await prisma.contextNote.update({
    where: { id: noteId },
    data: { helpfulCount, notCount, visible },
  });
  await syncHasNote(note.postId);
}

export async function syncHasNote(postId: string): Promise<void> {
  const shown = await prisma.contextNote.count({
    where: { postId, visible: true, hidden: false },
  });
  await prisma.rMHark.updateMany({
    where: { id: postId, hasNote: shown === 0 },
    data: { hasNote: shown > 0 },
  });
}

export async function getPostNotes(postId: string, viewerId: string | null) {
  if (!(await viewablePost(postId, viewerId))) return null;
  const mineRating = viewerId ? { where: { raterId: viewerId }, select: { helpful: true } } : false;
  const select = {
    id: true,
    body: true,
    helpfulCount: true,
    notCount: true,
    authorId: true,
    ...(mineRating ? { ratings: mineRating } : {}),
  } as const;
  const [shown, pending] = await Promise.all([
    prisma.contextNote.findMany({
      where: { postId, visible: true, hidden: false },
      orderBy: { helpfulCount: 'desc' },
      take: 3,
      select,
    }),
    viewerId
      ? prisma.contextNote.findMany({
          where: { postId, visible: false, hidden: false },
          orderBy: { createdAt: 'desc' },
          take: MAX_NOTES_PER_POST,
          select,
        })
      : Promise.resolve([]),
  ]);
  const map = (n: (typeof shown)[number]) => ({
    id: n.id,
    body: n.body,
    mine: n.authorId === viewerId,
    myRating: (n as { ratings?: { helpful: boolean }[] }).ratings?.[0]?.helpful ?? null,
  });
  return {
    shown: shown.map((n) => ({ ...map(n), helpfulCount: n.helpfulCount, notCount: n.notCount })),
    pending: pending.map(map),
  };
}

type Fail = { ok: false; status: number; error: string };

export async function proposeNote(
  userId: string,
  postId: string,
  body: string,
): Promise<{ ok: true; id: string } | Fail> {
  if (!(await viewablePost(postId, userId))) {
    return { ok: false, status: 404, error: 'Post not found' };
  }
  const open = await prisma.contextNote.count({ where: { postId, hidden: false } });
  if (open >= MAX_NOTES_PER_POST) {
    return { ok: false, status: 409, error: 'This post already has enough proposed notes' };
  }
  const mine = await prisma.contextNote.findUnique({
    where: { postId_authorId: { postId, authorId: userId } },
    select: { id: true },
  });
  if (mine) return { ok: false, status: 409, error: 'You already proposed a note on this post' };
  const note = await prisma.contextNote.create({
    data: { postId, authorId: userId, body },
    select: { id: true },
  });
  return { ok: true, id: note.id };
}

export async function rateNote(
  userId: string,
  noteId: string,
  helpful: boolean,
): Promise<{ ok: true } | Fail> {
  const note = await prisma.contextNote.findUnique({
    where: { id: noteId },
    select: { authorId: true, postId: true, hidden: true },
  });
  if (!note || note.hidden || !(await viewablePost(note.postId, userId))) {
    return { ok: false, status: 404, error: 'Note not found' };
  }
  if (note.authorId === userId) {
    return { ok: false, status: 403, error: 'You cannot rate your own note' };
  }
  await prisma.contextNoteRating.upsert({
    where: { noteId_raterId: { noteId, raterId: userId } },
    create: { noteId, raterId: userId, helpful },
    update: { helpful },
  });
  await refreshNote(noteId);
  return { ok: true };
}

export async function withdrawNote(userId: string, noteId: string): Promise<boolean> {
  const note = await prisma.contextNote.findUnique({
    where: { id: noteId },
    select: { authorId: true, postId: true },
  });
  if (!note || note.authorId !== userId) return false;
  await prisma.contextNote.delete({ where: { id: noteId } });
  await syncHasNote(note.postId);
  return true;
}

export async function listNotesForAdmin(filter: 'shown' | 'pending' | 'hidden') {
  const where =
    filter === 'hidden'
      ? { hidden: true }
      : filter === 'shown'
        ? { visible: true, hidden: false }
        : { visible: false, hidden: false };
  const rows = await prisma.contextNote.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      postId: true,
      body: true,
      helpfulCount: true,
      notCount: true,
      visible: true,
      hidden: true,
      createdAt: true,
      post: { select: { content: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    postId: r.postId,
    body: r.body,
    helpfulCount: r.helpfulCount,
    notCount: r.notCount,
    visible: r.visible,
    hidden: r.hidden,
    createdAt: r.createdAt.toISOString(),
    postExcerpt: r.post.content.slice(0, 160),
  }));
}

/** Admin hide/unhide. Hiding always wins; unhiding re-runs the bridging rule. */
export async function setNoteHidden(noteId: string, hidden: boolean): Promise<boolean> {
  const note = await prisma.contextNote.findUnique({
    where: { id: noteId },
    select: { postId: true },
  });
  if (!note) return false;
  await prisma.contextNote.update({
    where: { id: noteId },
    data: hidden ? { hidden: true, visible: false } : { hidden: false },
  });
  if (hidden) await syncHasNote(note.postId);
  else await refreshNote(noteId);
  return true;
}

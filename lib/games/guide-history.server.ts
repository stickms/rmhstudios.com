/**
 * A game guide's history (s09-05, server-only).
 *
 * `updateGuide` writes a `GameGuideRevision` (the body before an edit, with that edit's note) whenever the body
 * changes. Earlier versions can hold material the author removed on purpose, so history is for the author and
 * admins (moderation) and is never public. Restoring goes back through `updateGuide`, which makes the current body a
 * revision first, so history is only ever added to.
 *
 * Every function here answers `null` / `'not_found'` for a stranger and for a missing guide alike, so a probe cannot
 * tell them apart.
 */
import { prisma } from '@/lib/prisma.server';
import { GameMetaError, updateGuide } from '@/lib/games/meta.server';
import { GAME_CONTENT_REMOVED } from '@/lib/games/moderation';
import type { GuideRevisionRow } from '@/lib/games/guide-history.contract';

export interface HistoryViewer {
  userId: string | null;
  isAdmin: boolean;
}

/**
 * Server paths that return a guide's earlier text, and so must apply the author-or-admin rule. Held by a
 * source-scan test in `lib/games/__tests__/guide-history.test.ts`.
 */
export const GUIDE_HISTORY_READ_PATHS = [
  'lib/games/api/guides.$id.revisions.server.ts',
  'lib/games/api/guides.$id.revisions.$revisionId.server.ts',
  'app/routes/games/_library/$gameId_.guides.$guideId_.history.tsx',
] as const;

async function readableGuide(viewer: HistoryViewer, guideId: string) {
  if (!viewer.userId) return null;
  const guide = await prisma.gameGuide.findUnique({
    where: { id: guideId },
    select: { id: true, authorId: true, gameId: true, title: true, published: true, createdAt: true },
  });
  if (!guide) return null;
  if (guide.authorId !== viewer.userId && !viewer.isAdmin) return null;
  return guide;
}

/** Lengths come from the database so no body is selected for the list. */
interface RevisionLengthRow {
  id: string;
  note: string | null;
  createdAt: Date;
  length: number;
}

export async function listGuideRevisions(viewer: HistoryViewer, guideId: string) {
  const guide = await readableGuide(viewer, guideId);
  if (!guide) return null;
  const [rows, current] = await Promise.all([
    prisma.$queryRaw<RevisionLengthRow[]>`
      SELECT "id", "note", "createdAt", char_length("body")::int AS "length"
      FROM "game_guide_revision"
      WHERE "guideId" = ${guideId}
      ORDER BY "createdAt" DESC, "id" DESC`,
    prisma.$queryRaw<{ length: number }[]>`
      SELECT char_length("body")::int AS "length" FROM "game_guide" WHERE "id" = ${guideId}`,
  ]);
  const currentLength = Number(current[0]?.length ?? 0);
  const revisions: GuideRevisionRow[] = [];
  // The text an edit produced is the next-newer revision's body, or the current text for the newest edit.
  let after = currentLength;
  for (const r of rows) {
    const length = Number(r.length);
    revisions.push({
      id: r.id,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      length,
      delta: after - length,
    });
    after = length;
  }
  return { revisions, currentLength, canRestore: guide.authorId === viewer.userId };
}

export async function getGuideRevision(viewer: HistoryViewer, guideId: string, revisionId: string) {
  const guide = await readableGuide(viewer, guideId);
  if (!guide) return null;
  const rev = await prisma.gameGuideRevision.findFirst({
    where: { id: revisionId, guideId },
    select: { id: true, note: true, createdAt: true, body: true },
  });
  if (!rev) return null;
  return { id: rev.id, note: rev.note, createdAt: rev.createdAt.toISOString(), body: rev.body };
}

/** What the history page's loader needs: the guide with its current text, for the author or an admin. */
export async function getGuideForHistory(viewer: HistoryViewer, gameId: string, guideId: string) {
  const guide = await readableGuide(viewer, guideId);
  if (!guide || guide.gameId !== gameId) return null;
  const current = await prisma.gameGuide.findUnique({ where: { id: guideId }, select: { body: true } });
  if (!current) return null;
  return {
    id: guide.id,
    gameId: guide.gameId,
    title: guide.title,
    body: current.body,
    canRestore: guide.authorId === viewer.userId,
  };
}

export type RestoreResult = 'ok' | 'not_found' | 'forbidden' | 'removed';

/** The English note a restore is recorded with; the date is when that version became current. */
export function restoreNote(since: Date): string {
  return `Restored the version of ${since.toISOString().slice(0, 10)}`;
}

/**
 * Restore is the author's alone: `updateGuide` refuses anyone else, and an admin restoring would be an edit in the
 * author's name. A stranger gets `not_found`; an admin who can read the history gets `forbidden`.
 */
export async function restoreGuideRevision(
  viewer: HistoryViewer,
  guideId: string,
  revisionId: string,
): Promise<RestoreResult> {
  const guide = await readableGuide(viewer, guideId);
  if (!guide) return 'not_found';
  if (guide.authorId !== viewer.userId) return 'forbidden';
  const rev = await prisma.gameGuideRevision.findFirst({
    where: { id: revisionId, guideId },
    select: { body: true, createdAt: true },
  });
  if (!rev) return 'not_found';
  // The version became current when the edit before the one that replaced it was made (or when the guide began).
  const older = await prisma.gameGuideRevision.findFirst({
    where: { guideId, createdAt: { lt: rev.createdAt } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const since = older?.createdAt ?? guide.createdAt;
  try {
    await updateGuide(viewer.userId as string, guideId, { body: rev.body, note: restoreNote(since) });
  } catch (e) {
    // A guide a moderator removed cannot be changed, and a restore is a change (s14-08).
    if (e instanceof GameMetaError && e.message === GAME_CONTENT_REMOVED) return 'removed';
    if (e instanceof GameMetaError) return e.message === 'FORBIDDEN' ? 'forbidden' : 'not_found';
    throw e;
  }
  return 'ok';
}

const EXPORT_MAX_GUIDES = 1_000;

export interface GuideExport {
  id: string;
  gameId: string;
  title: string;
  body: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GuideRevisionExport {
  guideId: string;
  gameId: string;
  note: string | null;
  createdAt: string;
  body: string;
}

/** The member's own guides, for the account export (guides were not in it before). */
export async function exportGuides(userId: string): Promise<GuideExport[]> {
  const rows = await prisma.gameGuide.findMany({
    where: { authorId: userId },
    orderBy: { createdAt: 'asc' },
    take: EXPORT_MAX_GUIDES,
    select: { id: true, gameId: true, title: true, body: true, published: true, createdAt: true, updatedAt: true },
  });
  return (Array.isArray(rows) ? rows : []).map((g) => ({
    id: g.id,
    gameId: g.gameId,
    title: g.title,
    body: g.body,
    published: g.published,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  }));
}

/** Revisions of the member's own guides. Guides are single-author, so every body here is the member's own text. */
export async function exportGuideRevisions(userId: string): Promise<GuideRevisionExport[]> {
  const rows = await prisma.gameGuideRevision.findMany({
    where: { guide: { authorId: userId } },
    orderBy: { createdAt: 'asc' },
    take: EXPORT_MAX_GUIDES * 50,
    select: { note: true, createdAt: true, body: true, guide: { select: { id: true, gameId: true } } },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    guideId: r.guide.id,
    gameId: r.guide.gameId,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    body: r.body,
  }));
}

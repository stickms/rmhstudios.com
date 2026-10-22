/**
 * Shelves (L7) and the yearly reading challenge (L3) — server only.
 *
 * The challenge is derived, not tracked: a book counts toward the year the
 * member finished it, and "finished" is a shelf entry on the `read` shelf with a
 * `finishedAt` stamp (set when they shelve it as read, or when the reader
 * reaches the last page). Pages are snapshotted on the entry so a page goal
 * needs no join against the library.
 */

import { prisma } from '@/lib/prisma.server';
import { getBook } from '@/lib/library/library.server';
import { getHiddenAuthorIdsStrict } from '@/lib/moderation.server';
import type { GoalProgress, ShelfEntryView, ShelfId, ShelfPrefs, ShelfPublicView } from './schema';

const MAX_ENTRIES = 500;

function toView(r: {
  docSlug: string;
  title: string;
  shelf: ShelfId;
  pages: number;
  finishedAt: Date | null;
  updatedAt: Date;
}): ShelfEntryView {
  return {
    slug: r.docSlug,
    title: r.title,
    shelf: r.shelf,
    pages: r.pages,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function getPrefs(userId: string): Promise<ShelfPrefs> {
  const row = await prisma.readingPrefs.findUnique({
    where: { userId },
    select: { wantPublic: true, readingPublic: true, readPublic: true },
  });
  return row ?? { wantPublic: false, readingPublic: false, readPublic: false };
}

export async function setPrefs(userId: string, patch: Partial<ShelfPrefs>): Promise<ShelfPrefs> {
  const row = await prisma.readingPrefs.upsert({
    where: { userId },
    create: { userId, ...patch },
    update: patch,
    select: { wantPublic: true, readingPublic: true, readPublic: true },
  });
  return row;
}

export async function getMyShelves(userId: string) {
  const [rows, prefs] = await Promise.all([
    prisma.readingShelfEntry.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: MAX_ENTRIES,
      select: {
        docSlug: true,
        title: true,
        shelf: true,
        pages: true,
        finishedAt: true,
        updatedAt: true,
      },
    }),
    getPrefs(userId),
  ]);
  return { entries: rows.map(toView), prefs };
}

export type SetShelfResult =
  { ok: true; entry: ShelfEntryView } | { ok: false; status: number; error: string };

export async function setShelf(
  userId: string,
  input: { slug: string; title: string; shelf: ShelfId; pages: number },
): Promise<SetShelfResult> {
  const book = await getBook(input.slug);
  if (!book) return { ok: false, status: 404, error: 'Book not found' };
  const existing = await prisma.readingShelfEntry.findUnique({
    where: { userId_docSlug: { userId, docSlug: input.slug } },
    select: { finishedAt: true, pages: true },
  });
  const finishedAt = input.shelf === 'read' ? (existing?.finishedAt ?? new Date()) : null;
  const pages = book.pages > 0 ? book.pages : input.pages || existing?.pages || 0;
  const row = await prisma.readingShelfEntry.upsert({
    where: { userId_docSlug: { userId, docSlug: input.slug } },
    create: {
      userId,
      docSlug: input.slug,
      title: book.title,
      shelf: input.shelf,
      pages,
      finishedAt,
    },
    update: { title: book.title, shelf: input.shelf, pages, finishedAt },
    select: {
      docSlug: true,
      title: true,
      shelf: true,
      pages: true,
      finishedAt: true,
      updatedAt: true,
    },
  });
  return { ok: true, entry: toView(row) };
}

export async function removeShelf(userId: string, slug: string): Promise<boolean> {
  const { count } = await prisma.readingShelfEntry.deleteMany({ where: { userId, docSlug: slug } });
  return count > 0;
}

/** The shelves a profile shows `viewerId`: only the ones the owner made public. */
export async function getPublicShelves(
  ownerId: string,
  viewerId: string | null,
): Promise<ShelfPublicView | null> {
  const isOwner = viewerId === ownerId;
  if (!isOwner && viewerId) {
    const hidden = await getHiddenAuthorIdsStrict(viewerId);
    if (hidden.includes(ownerId)) return null;
  }
  const prefs = await getPrefs(ownerId);
  const shelves: ShelfId[] = isOwner
    ? ['want', 'reading', 'read']
    : (
        [
          prefs.wantPublic ? 'want' : null,
          prefs.readingPublic ? 'reading' : null,
          prefs.readPublic ? 'read' : null,
        ] as Array<ShelfId | null>
      ).filter((s): s is ShelfId => s !== null);
  if (shelves.length === 0) return { isOwner, prefs, entries: [] };
  const rows = await prisma.readingShelfEntry.findMany({
    where: { userId: ownerId, shelf: { in: shelves } },
    orderBy: { updatedAt: 'desc' },
    take: 120,
    select: {
      docSlug: true,
      title: true,
      shelf: true,
      pages: true,
      finishedAt: true,
      updatedAt: true,
    },
  });
  return { isOwner, prefs, entries: rows.map(toView) };
}

/* ── L3: yearly challenge ─────────────────────────────────────────────────── */

export async function getGoalProgress(userId: string, year: number): Promise<GoalProgress | null> {
  const goal = await prisma.readingGoal.findUnique({
    where: { userId_year: { userId, year } },
    select: { year: true, unit: true, target: true },
  });
  if (!goal) return null;
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const agg = await prisma.readingShelfEntry.aggregate({
    where: { userId, shelf: 'read', finishedAt: { gte: from, lt: to } },
    _count: { _all: true },
    _sum: { pages: true },
  });
  const books = agg._count._all;
  const pages = agg._sum.pages ?? 0;
  return { ...goal, books, pages, done: goal.unit === 'books' ? books : pages };
}

export async function setGoal(
  userId: string,
  input: { year: number; unit: 'books' | 'pages'; target: number },
): Promise<GoalProgress> {
  await prisma.readingGoal.upsert({
    where: { userId_year: { userId, year: input.year } },
    create: { userId, ...input },
    update: { unit: input.unit, target: input.target },
  });
  return (await getGoalProgress(userId, input.year))!;
}

export async function clearGoal(userId: string, year: number): Promise<void> {
  await prisma.readingGoal.deleteMany({ where: { userId, year } });
}

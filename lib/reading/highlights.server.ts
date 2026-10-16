/**
 * Highlights, public notes and popular-passage counters (L1, L8) — server only.
 *
 * Privacy rule that everything here hangs on: a private highlight (and its note)
 * is only ever returned to its owner. Public highlights expose their quote and
 * note, never anything private about the author beyond the usual display fields.
 *
 * L8 counters are maintained incrementally, never recomputed on read:
 *  - `ReadingPassageStat.readers` counts DISTINCT members with at least one
 *    public highlight touching the passage (a sentence, see passages.ts);
 *  - `ReadingHighlightPassage` records exactly which passages each public
 *    highlight counted toward, so deleting it (or making it private) decrements
 *    precisely what creating it incremented — and only when it was that member's
 *    last public highlight on the passage.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { getBook } from '@/lib/library/library.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { MIN_READERS_TO_SHOW, type PassageRef } from './passages';
import {
  MAX_HIGHLIGHTS_PER_DOC,
  type DocBundle,
  type HighlightView,
  type MyHighlightsPage,
  type PopularPassage,
  type PublicNoteView,
  type ReadingDocKind,
} from './schema';
import { listGlossary } from './glossary.server';

type Tx = Prisma.TransactionClient;

const PUBLIC_NOTES_LIMIT = 30;
const POPULAR_LIMIT = 200;
const POPULAR_TTL_MS = 30_000;

function invalidateDoc(kind: ReadingDocKind, key: string): void {
  apiCache.invalidate(`reading:popular:${kind}:${key}`);
  apiCache.invalidate(`reading:pubnotes:${kind}:${key}`);
}

export async function docExists(kind: ReadingDocKind, key: string): Promise<boolean> {
  if (kind === 'library') return (await getBook(key)) !== undefined;
  if (kind === 'news') {
    const a = await prisma.newsArticle.findUnique({
      where: { slug: key },
      select: { status: true },
    });
    return a !== null && a.status === 'PUBLISHED';
  }
  return (
    (await prisma.blogPost.findUnique({ where: { slug: key }, select: { id: true } })) !== null
  );
}

function toView(h: {
  id: string;
  unit: string;
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  version: string;
  note: string | null;
  isPublic: boolean;
  createdAt: Date;
}): HighlightView {
  return {
    id: h.id,
    unit: h.unit,
    exact: h.exact,
    prefix: h.prefix,
    suffix: h.suffix,
    start: h.start,
    end: h.end,
    version: h.version,
    note: h.note,
    isPublic: h.isPublic,
    createdAt: h.createdAt.toISOString(),
  };
}

const VIEW_SELECT = {
  id: true,
  unit: true,
  exact: true,
  prefix: true,
  suffix: true,
  start: true,
  end: true,
  version: true,
  note: true,
  isPublic: true,
  createdAt: true,
} as const;

/** Passages with at least MIN_READERS_TO_SHOW readers; briefly cached per document. */
async function popularFor(kind: ReadingDocKind, key: string): Promise<PopularPassage[]> {
  const cacheKey = `reading:popular:${kind}:${key}`;
  const hit = apiCache.get<PopularPassage[]>(cacheKey);
  if (hit) return hit;
  const rows = await prisma.readingPassageStat.findMany({
    where: { docKind: kind, docKey: key, readers: { gte: MIN_READERS_TO_SHOW } },
    orderBy: { readers: 'desc' },
    take: POPULAR_LIMIT,
    select: { unit: true, sample: true, start: true, readers: true },
  });
  apiCache.set(cacheKey, rows, POPULAR_TTL_MS);
  return rows;
}

/**
 * Public notes on a document, excluding the viewer's own and anyone they block
 * or mute. Anonymous viewers all see the same list, so it is cached briefly.
 */
async function publicNotesFor(
  kind: ReadingDocKind,
  key: string,
  userId: string | null,
  hidden: string[],
): Promise<PublicNoteView[]> {
  const cacheKey = `reading:pubnotes:${kind}:${key}`;
  if (!userId) {
    const hit = apiCache.get<PublicNoteView[]>(cacheKey);
    if (hit) return hit;
  }
  const rows = await prisma.readingHighlight.findMany({
    where: {
      docKind: kind,
      docKey: key,
      isPublic: true,
      note: { not: null },
      ...(userId ? { userId: { notIn: [userId, ...hidden] } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: PUBLIC_NOTES_LIMIT,
    select: { ...VIEW_SELECT, user: { select: userDisplaySelect } },
  });
  const notes = rows.map((r) => {
    const u = resolveUser(r.user);
    return { ...toView(r), author: { id: u.id, name: u.name, image: u.image, handle: u.handle } };
  });
  if (!userId) apiCache.set(cacheKey, notes, POPULAR_TTL_MS);
  return notes;
}

/** One request's worth of reading data for a document. */
export async function getDocBundle(
  kind: ReadingDocKind,
  key: string,
  userId: string | null,
): Promise<DocBundle> {
  const [glossary, popular, hidden] = await Promise.all([
    listGlossary(),
    popularFor(kind, key),
    getHiddenAuthorIds(userId),
  ]);

  const [mine, publicNotes] = await Promise.all([
    userId
      ? prisma.readingHighlight.findMany({
          where: { userId, docKind: kind, docKey: key },
          orderBy: [{ unit: 'asc' }, { start: 'asc' }],
          take: MAX_HIGHLIGHTS_PER_DOC,
          select: VIEW_SELECT,
        })
      : Promise.resolve([]),
    publicNotesFor(kind, key, userId, hidden),
  ]);

  return { glossary, signedIn: userId !== null, mine: mine.map(toView), publicNotes, popular };
}

async function addPassages(
  tx: Tx,
  h: { id: string; userId: string; docKind: ReadingDocKind; docKey: string; unit: string },
  passages: PassageRef[],
): Promise<void> {
  for (const p of passages) {
    const stat = await tx.readingPassageStat.upsert({
      where: {
        docKind_docKey_unit_passage: {
          docKind: h.docKind,
          docKey: h.docKey,
          unit: h.unit,
          passage: p.passage,
        },
      },
      create: {
        docKind: h.docKind,
        docKey: h.docKey,
        unit: h.unit,
        passage: p.passage,
        sample: p.sample,
        start: p.start,
      },
      update: { sample: p.sample, start: p.start },
      select: { id: true },
    });
    const already = await tx.readingHighlightPassage.count({
      where: { statId: stat.id, userId: h.userId },
    });
    await tx.readingHighlightPassage.create({
      data: { highlightId: h.id, statId: stat.id, userId: h.userId },
    });
    if (already === 0) {
      await tx.readingPassageStat.update({
        where: { id: stat.id },
        data: { readers: { increment: 1 } },
      });
    }
  }
}

async function removePassages(tx: Tx, highlightId: string, userId: string): Promise<void> {
  const links = await tx.readingHighlightPassage.findMany({
    where: { highlightId },
    select: { statId: true },
  });
  if (links.length === 0) return;
  await tx.readingHighlightPassage.deleteMany({ where: { highlightId } });
  for (const l of links) {
    const remaining = await tx.readingHighlightPassage.count({
      where: { statId: l.statId, userId },
    });
    if (remaining === 0) {
      await tx.readingPassageStat.updateMany({
        where: { id: l.statId, readers: { gt: 0 } },
        data: { readers: { decrement: 1 } },
      });
    }
  }
}

export interface NewHighlight {
  kind: ReadingDocKind;
  key: string;
  unit: string;
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  version: string;
  note?: string;
  isPublic: boolean;
  passages: PassageRef[];
}

export type CreateResult =
  { ok: true; highlight: HighlightView } | { ok: false; status: number; error: string };

export async function createHighlight(userId: string, input: NewHighlight): Promise<CreateResult> {
  if (!(await docExists(input.kind, input.key))) {
    return { ok: false, status: 404, error: 'Document not found' };
  }
  const count = await prisma.readingHighlight.count({
    where: { userId, docKind: input.kind, docKey: input.key },
  });
  if (count >= MAX_HIGHLIGHTS_PER_DOC) {
    return { ok: false, status: 409, error: 'Highlight limit reached for this document' };
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.readingHighlight.create({
      data: {
        userId,
        docKind: input.kind,
        docKey: input.key,
        unit: input.unit,
        exact: input.exact,
        prefix: input.prefix,
        suffix: input.suffix,
        start: input.start,
        end: input.end,
        version: input.version,
        note: input.note?.length ? input.note : null,
        isPublic: input.isPublic,
      },
      select: VIEW_SELECT,
    });
    if (input.isPublic) {
      await addPassages(
        tx,
        { id: created.id, userId, docKind: input.kind, docKey: input.key, unit: input.unit },
        input.passages,
      );
    }
    return created;
  });
  invalidateDoc(input.kind, input.key);
  return { ok: true, highlight: toView(row) };
}

export async function updateHighlight(
  userId: string,
  id: string,
  patch: { note?: string | null; isPublic?: boolean; passages?: PassageRef[] },
): Promise<HighlightView | null> {
  const existing = await prisma.readingHighlight.findFirst({
    where: { id, userId },
    select: { id: true, docKind: true, docKey: true, unit: true, isPublic: true },
  });
  if (!existing) return null;
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.readingHighlight.update({
      where: { id },
      data: {
        ...(patch.note !== undefined ? { note: patch.note?.length ? patch.note : null } : {}),
        ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
      },
      select: VIEW_SELECT,
    });
    if (patch.isPublic === true && !existing.isPublic) {
      await addPassages(
        tx,
        { id, userId, docKind: existing.docKind, docKey: existing.docKey, unit: existing.unit },
        patch.passages ?? [],
      );
    } else if (patch.isPublic === false && existing.isPublic) {
      await removePassages(tx, id, userId);
    }
    return updated;
  });
  invalidateDoc(existing.docKind, existing.docKey);
  return toView(row);
}

export async function deleteHighlight(userId: string, id: string): Promise<boolean> {
  const existing = await prisma.readingHighlight.findFirst({
    where: { id, userId },
    select: { id: true, docKind: true, docKey: true, isPublic: true },
  });
  if (!existing) return false;
  await prisma.$transaction(async (tx) => {
    if (existing.isPublic) await removePassages(tx, id, userId);
    await tx.readingHighlight.delete({ where: { id } });
  });
  invalidateDoc(existing.docKind, existing.docKey);
  return true;
}

/** The "My highlights" page: newest first, across every document. */
export async function listMyHighlights(
  userId: string,
  cursor: string | null,
  limit = 30,
): Promise<MyHighlightsPage> {
  const rows = await prisma.readingHighlight.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { ...VIEW_SELECT, docKind: true, docKey: true },
  });
  const page = rows.slice(0, limit);

  const slugsOf = (k: ReadingDocKind) => [
    ...new Set(page.filter((r) => r.docKind === k).map((r) => r.docKey)),
  ];
  const [blog, news, lib] = await Promise.all([
    slugsOf('blog').length
      ? prisma.blogPost.findMany({
          where: { slug: { in: slugsOf('blog') } },
          select: { slug: true, title: true },
        })
      : [],
    slugsOf('news').length
      ? prisma.newsArticle.findMany({
          where: { slug: { in: slugsOf('news') } },
          select: { slug: true, title: true },
        })
      : [],
    slugsOf('library').length
      ? prisma.libraryDocument.findMany({
          where: { slug: { in: slugsOf('library') } },
          select: { slug: true, title: true },
        })
      : [],
  ]);
  const titles = new Map<string, string>();
  for (const r of blog) titles.set(`blog:${r.slug}`, r.title);
  for (const r of news) titles.set(`news:${r.slug}`, r.title);
  for (const r of lib) titles.set(`library:${r.slug}`, r.title);

  const hrefFor = (kind: ReadingDocKind, key: string) =>
    kind === 'blog' ? `/blog/${key}` : kind === 'news' ? `/news/${key}` : `/library/${key}`;

  return {
    items: page.map((r) => ({
      ...toView(r),
      kind: r.docKind,
      key: r.docKey,
      title: titles.get(`${r.docKind}:${r.docKey}`) ?? r.docKey,
      href: hrefFor(r.docKind, r.docKey),
    })),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}

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
import { cached, invalidateCached } from '@/lib/cached.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { getBook } from '@/lib/library/library.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { MIN_READERS_TO_SHOW, type PassageRef } from './passages';
import {
  MAX_HIGHLIGHTS_PER_DOC,
  type DocBundle,
  type HighlightView,
  type MyHighlightRow,
  type MyHighlightsPage,
  type PopularPassage,
  type PublicNoteView,
  type ReadingDocKind,
} from './schema';
import { listGlossary } from './glossary.server';
import { SITE_URL } from '@/lib/seo';
import { EXPORT_CAP, type ExportRow } from './highlights-export';
import type { HighlightsFilter } from './highlights-search-schema';

type Tx = Prisma.TransactionClient;

const PUBLIC_NOTES_LIMIT = 30;
const POPULAR_LIMIT = 200;
const POPULAR_TTL_MS = 30_000;

function invalidateDoc(kind: ReadingDocKind, key: string): void {
  void invalidateCached(`reading:popular:${kind}:${key}`);
  void invalidateCached(`reading:pubnotes:${kind}:${key}`);
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
  return cached(
    cacheKey,
    POPULAR_TTL_MS,
    async () => {
      const rows = await prisma.readingPassageStat.findMany({
        where: { docKind: kind, docKey: key, readers: { gte: MIN_READERS_TO_SHOW } },
        orderBy: { readers: 'desc' },
        take: POPULAR_LIMIT,
        select: { unit: true, sample: true, start: true, readers: true },
      });
      return rows;
    },
    { l2: false },
  );
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
  // Only the anonymous (viewer-independent) list is shared; a signed-in viewer's list excludes their own notes.
  if (!userId) return cached(cacheKey, POPULAR_TTL_MS, () => loadPublicNotes(), { l2: false });
  return loadPublicNotes();

  async function loadPublicNotes(): Promise<PublicNoteView[]> {
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
    return notes;
  }
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

const hrefFor = (kind: ReadingDocKind, key: string) =>
  kind === 'blog' ? `/blog/${key}` : kind === 'news' ? `/news/${key}` : `/library/${key}`;

/** Titles for a set of highlights' documents, keyed `kind:key`; a missing document falls back to its key. */
async function documentTitles(
  rows: readonly { docKind: ReadingDocKind; docKey: string }[],
): Promise<Map<string, string>> {
  const slugsOf = (k: ReadingDocKind) => [
    ...new Set(rows.filter((r) => r.docKind === k).map((r) => r.docKey)),
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
  return titles;
}

type MyRow = Awaited<ReturnType<typeof loadRows>>[number];

function loadRows(where: Prisma.ReadingHighlightWhereInput, orderBy: Prisma.ReadingHighlightOrderByWithRelationInput[], extra: { take: number; cursor?: string | null }) {
  return prisma.readingHighlight.findMany({
    where,
    orderBy,
    take: extra.take,
    ...(extra.cursor ? { cursor: { id: extra.cursor }, skip: 1 } : {}),
    select: { ...VIEW_SELECT, docKind: true, docKey: true },
  });
}

async function toMyRows(rows: MyRow[]): Promise<MyHighlightRow[]> {
  const titles = await documentTitles(rows);
  return rows.map((r) => ({
    ...toView(r),
    kind: r.docKind,
    key: r.docKey,
    title: titles.get(`${r.docKind}:${r.docKey}`) ?? r.docKey,
    href: hrefFor(r.docKind, r.docKey),
  }));
}

const NEWEST: Prisma.ReadingHighlightOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];
const ORDERS: Record<NonNullable<HighlightsFilter['sort']>, Prisma.ReadingHighlightOrderByWithRelationInput[]> = {
  newest: NEWEST,
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  document: [{ docKind: 'asc' }, { docKey: 'asc' }, { unit: 'asc' }, { start: 'asc' }, { id: 'asc' }],
};

/** The "My highlights" page: newest first, across every document. */
export async function listMyHighlights(
  userId: string,
  cursor: string | null,
  limit = 30,
): Promise<MyHighlightsPage> {
  const rows = await loadRows({ userId }, NEWEST, { take: limit + 1, cursor });
  const page = rows.slice(0, limit);
  return {
    items: await toMyRows(page),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
  };
}

/** Every query starts from the member's own rows; the filter only narrows them. */
function filterWhere(userId: string, f: HighlightsFilter): Prisma.ReadingHighlightWhereInput {
  const q = f.q?.trim();
  return {
    userId,
    ...(f.kind ? { docKind: f.kind } : {}),
    ...(f.visibility ? { isPublic: f.visibility === 'public' } : {}),
    ...(f.hasNote ? { note: { not: null } } : {}),
    ...(q
      ? {
          OR: [
            { exact: { contains: q, mode: 'insensitive' as const } },
            { note: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
}

const SEARCH_PAGE = 30;

/** The notebook's list: the member's highlights narrowed by search and filters, one page at a time. */
export async function searchHighlights(
  userId: string,
  filter: HighlightsFilter,
  cursor: string | null,
  limit = SEARCH_PAGE,
): Promise<MyHighlightsPage & { total: number }> {
  const where = filterWhere(userId, filter);
  const [rows, total] = await Promise.all([
    loadRows(where, ORDERS[filter.sort ?? 'newest'], { take: limit + 1, cursor }),
    prisma.readingHighlight.count({ where }),
  ]);
  const page = rows.slice(0, limit);
  return {
    items: await toMyRows(page),
    nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    total,
  };
}

/**
 * Everything an export needs, with document titles and absolute links resolved.
 * `ids` narrows the filter's matches to a selection; ids that are not the
 * member's simply match nothing. At most EXPORT_CAP rows.
 */
export async function exportHighlights(
  userId: string,
  filter: HighlightsFilter,
  ids?: readonly string[],
): Promise<ExportRow[]> {
  const where = filterWhere(userId, filter);
  const rows = await loadRows(ids ? { ...where, id: { in: [...ids] } } : where, ORDERS[filter.sort ?? 'newest'], {
    take: EXPORT_CAP,
  });
  const titles = await documentTitles(rows);
  return rows.map((r) => ({
    id: r.id,
    kind: r.docKind,
    key: r.docKey,
    unit: r.unit,
    start: r.start,
    title: titles.get(`${r.docKind}:${r.docKey}`) ?? r.docKey,
    url: `${SITE_URL}${hrefFor(r.docKind, r.docKey)}`,
    exact: r.exact,
    note: r.note,
    isPublic: r.isPublic,
    createdAt: r.createdAt.toISOString(),
  }));
}

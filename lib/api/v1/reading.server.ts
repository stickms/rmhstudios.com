/**
 * Adapters from the v1 shapes (`/api/v1/me/highlights*`, `/api/v1/me/shelves*`, `/api/v1/me/reading-goal`) to the
 * functions the site uses. Every function acts as the key owner and takes no other member's id. Edits and deletes go
 * through `updateHighlight` / `deleteHighlight` / `setShelf` / `removeShelf`, so the public-highlight rules and the
 * passage counters are the site's. Highlights cannot be created here: an anchor needs the text position the site
 * computes from the rendered document.
 *
 * Making a highlight public through the API runs `updateHighlight` without passages (the site's reader computes
 * those from the rendered text), so it is public without counting toward a "popular passage"; making it private
 * again removes whatever the site had counted for it.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { publishedLogWhere } from '@/lib/blog/publication';
import { getLibraryBook } from '@/lib/library/library';
import { SITE_URL } from '@/lib/seo';
import { rateLimit, RATE_LIMIT_POLICIES } from '@/lib/rate-limit';
import { deleteHighlight, updateHighlight } from '@/lib/reading/highlights.server';
import { getGoalProgress, getMyShelves, removeShelf, setShelf } from '@/lib/reading/shelves.server';
import type { ReadingDocKind, ShelfId } from '@/lib/reading/schema';
import {
  decodeHighlightCursor,
  encodeHighlightCursor,
  type HighlightsQuery,
  type PatchHighlightBody,
  type PutShelfBody,
} from '@/lib/api/v1/reading-schema';

export interface ApiHighlight {
  id: string;
  kind: ReadingDocKind;
  key: string;
  /** `null` when the document no longer exists (removed, unpublished or hidden); the note is still yours. */
  document: { title: string; url: string } | null;
  quote: string;
  note: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiShelfEntry {
  slug: string;
  title: string;
  shelf: ShelfId;
  pages: number;
  finishedAt: string | null;
  updatedAt: string;
}

export interface ApiReadingGoal {
  year: number;
  goal: {
    unit: 'books' | 'pages';
    target: number;
    books: number;
    pages: number;
    done: number;
  } | null;
}

/** Writes also draw on the member's own `write` budget, on top of the key's rate limit. */
export function writeBudgetExceeded(userId: string): boolean {
  return !rateLimit(userId, {
    ...RATE_LIMIT_POLICIES.write,
    prefix: 'v1-reading-write',
  }).allowed;
}

export { queryOf, readInput, readBody } from './request-input';

const pathFor = (kind: ReadingDocKind, key: string) =>
  kind === 'blog' ? `/blog/${key}` : kind === 'news' ? `/news/${key}` : `/library/${key}`;

type DocRef = { docKind: ReadingDocKind; docKey: string };

/**
 * Titles of the documents that still exist, keyed `kind:key`: one query per kind present on the page. A document that
 * is absent here is returned as `document: null`. Existence follows the site's own `docExists`: published blog posts
 * and news, and library books that are not hidden (an uploaded row wins over the bundled catalog).
 */
async function liveDocumentTitles(rows: readonly DocRef[]): Promise<Map<string, string>> {
  const keysOf = (k: ReadingDocKind) => [...new Set(rows.filter((r) => r.docKind === k).map((r) => r.docKey))];
  const blog = keysOf('blog');
  const news = keysOf('news');
  const lib = keysOf('library');
  const [blogRows, newsRows, libRows] = await Promise.all([
    blog.length
      ? prisma.blogPost.findMany({
          where: { slug: { in: blog }, ...publishedLogWhere(new Date()) },
          select: { slug: true, title: true },
        })
      : [],
    news.length
      ? prisma.newsArticle.findMany({
          where: { slug: { in: news }, status: 'PUBLISHED' },
          select: { slug: true, title: true },
        })
      : [],
    lib.length
      ? prisma.libraryDocument.findMany({
          where: { slug: { in: lib } },
          select: { slug: true, title: true, hidden: true },
        })
      : [],
  ]);
  const titles = new Map<string, string>();
  for (const r of blogRows) titles.set(`blog:${r.slug}`, r.title);
  for (const r of newsRows) titles.set(`news:${r.slug}`, r.title);
  const owned = new Set<string>();
  for (const r of libRows) {
    owned.add(r.slug);
    if (!r.hidden) titles.set(`library:${r.slug}`, r.title);
  }
  for (const slug of lib) {
    if (owned.has(slug)) continue;
    const book = getLibraryBook(slug);
    if (book) titles.set(`library:${slug}`, book.title);
  }
  return titles;
}

const HIGHLIGHT_SELECT = {
  id: true,
  docKind: true,
  docKey: true,
  exact: true,
  note: true,
  isPublic: true,
  createdAt: true,
  updatedAt: true,
} as const;

type HighlightRow = Prisma.ReadingHighlightGetPayload<{
  select: typeof HIGHLIGHT_SELECT;
}>;

function toApiHighlight(r: HighlightRow, titles: Map<string, string>): ApiHighlight {
  const title = titles.get(`${r.docKind}:${r.docKey}`);
  return {
    id: r.id,
    kind: r.docKind,
    key: r.docKey,
    document: title === undefined ? null : { title, url: `${SITE_URL}${pathFor(r.docKind, r.docKey)}` },
    quote: r.exact,
    note: r.note,
    isPublic: r.isPublic,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * The key owner's highlights. Default order is newest first by `(createdAt, id)`. With `since`, the highlights
 * updated after that instant, by `(updatedAt, id)` ascending so a sync can resume from the last item it stored;
 * each mode has its own cursor and a cursor from the other mode is `'invalid_cursor'`.
 */
export async function listMyHighlightsForKey(
  userId: string,
  q: HighlightsQuery,
): Promise<{ data: ApiHighlight[]; nextCursor: string | null } | 'invalid_cursor'> {
  const syncMode = q.since !== undefined;
  const mode = syncMode ? 'u' : 'c';
  const cursor = q.cursor ? decodeHighlightCursor(q.cursor) : null;
  if (q.cursor && (!cursor || cursor.mode !== mode)) return 'invalid_cursor';

  const field = syncMode ? 'updatedAt' : 'createdAt';
  const dir = syncMode ? 'gt' : 'lt';
  const and: Prisma.ReadingHighlightWhereInput[] = [];
  if (q.since !== undefined) and.push({ updatedAt: { gt: new Date(q.since) } });
  if (cursor)
    and.push({
      OR: [{ [field]: { [dir]: cursor.at } }, { [field]: cursor.at, id: { [dir]: cursor.id } }],
    });
  const where: Prisma.ReadingHighlightWhereInput = {
    userId,
    ...(q.kind ? { docKind: q.kind } : {}),
    ...(q.visibility ? { isPublic: q.visibility === 'public' } : {}),
    ...(q.hasNote === 'true' ? { note: { not: null } } : q.hasNote === 'false' ? { note: null } : {}),
    ...(and.length ? { AND: and } : {}),
  };
  const order = syncMode ? 'asc' : 'desc';
  const rows = await prisma.readingHighlight.findMany({
    where,
    orderBy: [{ [field]: order }, { id: order }],
    take: q.limit + 1,
    select: HIGHLIGHT_SELECT,
  });
  const page = rows.slice(0, q.limit);
  const titles = await liveDocumentTitles(page);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => toApiHighlight(r, titles)),
    nextCursor:
      rows.length > q.limit && last
        ? encodeHighlightCursor({
            mode,
            at: syncMode ? last.updatedAt : last.createdAt,
            id: last.id,
          })
        : null,
  };
}

/** Edit the note and/or visibility through the site's `updateHighlight`; `null` when it is not yours. */
export async function patchMyHighlight(
  userId: string,
  id: string,
  body: PatchHighlightBody,
): Promise<ApiHighlight | null> {
  const updated = await updateHighlight(userId, id, {
    ...(body.note !== undefined ? { note: body.note } : {}),
    ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
  });
  if (!updated) return null;
  const row = await prisma.readingHighlight.findFirst({
    where: { id, userId },
    select: HIGHLIGHT_SELECT,
  });
  if (!row) return null;
  return toApiHighlight(row, await liveDocumentTitles([row]));
}

export async function deleteMyHighlight(userId: string, id: string): Promise<boolean> {
  return deleteHighlight(userId, id);
}

export async function listMyShelvesForKey(
  userId: string,
  shelf: ShelfId | undefined,
): Promise<{ data: ApiShelfEntry[] }> {
  const { entries } = await getMyShelves(userId);
  return {
    data: (shelf ? entries.filter((e) => e.shelf === shelf) : entries).map((e) => ({
      slug: e.slug,
      title: e.title,
      shelf: e.shelf,
      pages: e.pages,
      finishedAt: e.finishedAt,
      updatedAt: e.updatedAt,
    })),
  };
}

/**
 * Shelve a book through `setShelf` (an unknown or hidden library slug is `null`, a 404). `finishedAt`, when sent,
 * replaces the stamp `setShelf` chose (its own default is "now", or the date already there), so a book finished
 * elsewhere counts toward the right year's goal.
 */
export async function putMyShelf(userId: string, slug: string, body: PutShelfBody): Promise<ApiShelfEntry | null> {
  const result = await setShelf(userId, {
    slug,
    title: '',
    shelf: body.shelf,
    pages: body.pages ?? 0,
  });
  if (!result.ok) return null;
  let entry = result.entry;
  if (body.shelf === 'read' && body.finishedAt) {
    const row = await prisma.readingShelfEntry.update({
      where: { userId_docSlug: { userId, docSlug: slug } },
      data: { finishedAt: new Date(body.finishedAt) },
      select: { finishedAt: true, updatedAt: true },
    });
    entry = {
      ...entry,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  return entry;
}

export async function deleteMyShelf(userId: string, slug: string): Promise<boolean> {
  return removeShelf(userId, slug);
}

export async function getMyReadingGoal(userId: string, year: number): Promise<ApiReadingGoal> {
  const p = await getGoalProgress(userId, year);
  return {
    year,
    goal: p
      ? {
          unit: p.unit,
          target: p.target,
          books: p.books,
          pages: p.pages,
          done: p.done,
        }
      : null,
  };
}

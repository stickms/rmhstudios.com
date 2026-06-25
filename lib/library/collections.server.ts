/**
 * RMH Studios — Library collections, data layer (server-only).
 *
 * CRUD for reader-made collections plus resolution of their member slugs into
 * displayable LibraryBooks. Ownership rules live here: a user may manage only
 * their own collections and may add only books they uploaded; admins manage any
 * collection (their own are "official") and may add any book.
 */
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { getLibraryBook, type LibraryBook } from './library';
import { mapDocToBook, type LibraryDocRow } from './merge';
import { slugifyTitle, libraryCoverKey, libraryCoverUrl } from './keys';
import { putObject } from '@/lib/storage/s3.server';
import { validateImageBuffer, detectImageExt } from '@/lib/slice-it/upload-validation';
import {
  validateCollectionFields,
  COLLECTION_USER_QUOTA,
  COLLECTION_ITEM_CAP,
  type CollectionView,
} from './collections';

export type Viewer = { id: string; isAdmin: boolean } | null;

export type CollectionResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

/** Record collection mutations performed by an admin (best-effort). */
function auditIfAdmin(viewer: Viewer, action: string, targetId: string, detail?: string): void {
  if (viewer?.isAdmin) {
    void logAdminAction(viewer.id, action, { targetType: 'LibraryCollection', targetId, detail });
  }
}

const DOC_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  pages: true,
  format: true,
  coverKey: true,
  official: true,
  position: true,
  hidden: true,
  reported: true,
  createdAt: true,
  toc: true,
  uploadedBy: { select: { handle: true, name: true } },
} as const;

// xAI is OpenAI-SDK compatible; point the base URL at their endpoint.
const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY || '', baseURL: 'https://api.x.ai/v1', maxRetries: 1 });
const XAI_IMAGE_MODEL = process.env.XAI_IMAGE_MODEL || 'grok-imagine-image';

/** True when an xAI key is set and image generation isn't disabled. */
export function isCollectionCoverConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY) && process.env.XAI_IMAGE_ENABLED !== 'false';
}

/** Resolve a set of book slugs into LibraryBooks (uploads/migrated first, then static). */
async function resolveBooksBySlugs(slugs: string[]): Promise<Map<string, LibraryBook>> {
  const out = new Map<string, LibraryBook>();
  if (slugs.length === 0) return out;
  const docs = await prisma.libraryDocument.findMany({
    where: { slug: { in: slugs }, hidden: false },
    select: DOC_SELECT,
  });
  for (const d of docs as LibraryDocRow[]) out.set(d.slug, mapDocToBook(d));
  for (const slug of slugs) {
    if (out.has(slug)) continue;
    const stat = getLibraryBook(slug);
    if (stat) out.set(slug, stat);
  }
  return out;
}

type CollectionRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  official: boolean;
  coverKey: string | null;
  ownerUserId: string | null;
  owner: { handle: string | null; name: string | null } | null;
  items: { bookSlug: string; position: number }[];
};

function toView(row: CollectionRow, books: Map<string, LibraryBook>, viewer: Viewer): CollectionView {
  const ordered = [...row.items].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    official: row.official,
    coverUrl: row.coverKey ? libraryCoverUrl(row.id) : null,
    ownerUserId: row.ownerUserId,
    owner: row.owner,
    books: ordered.map((i) => books.get(i.bookSlug)).filter((b): b is LibraryBook => Boolean(b)),
    canEdit: Boolean(viewer && (viewer.isAdmin || viewer.id === row.ownerUserId)),
  };
}

/** All non-hidden collections, resolved for display, official first. */
export async function listCollectionsView(viewer: Viewer): Promise<CollectionView[]> {
  const rows = (await prisma.libraryCollection.findMany({
    where: { hidden: false },
    orderBy: [{ official: 'desc' }, { position: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      official: true,
      coverKey: true,
      ownerUserId: true,
      owner: { select: { handle: true, name: true } },
      items: { select: { bookSlug: true, position: true } },
    },
  })) as CollectionRow[];

  const slugs = Array.from(new Set(rows.flatMap((r) => r.items.map((i) => i.bookSlug))));
  const books = await resolveBooksBySlugs(slugs);
  return rows.map((r) => toView(r, books, viewer));
}

async function uniqueCollectionSlug(base: string): Promise<string> {
  const root = base || 'series';
  const taken = async (slug: string) =>
    Boolean(await prisma.libraryCollection.findUnique({ where: { slug }, select: { id: true } }));
  if (!(await taken(root))) return root;
  for (let n = 2; n < 10000; n++) {
    const candidate = `${root}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${root}-${Date.now()}`;
}

/** Create a collection owned by the viewer (admins' are "official"). */
export async function createCollection(
  viewer: Viewer,
  input: { title: string; description?: string },
): Promise<CollectionResult<{ id: string; slug: string }>> {
  if (!viewer) return { ok: false, status: 401, error: 'You must be signed in.' };
  const fields = validateCollectionFields(input);
  if (!fields.ok) return { ok: false, status: 422, error: fields.error };

  if (!viewer.isAdmin) {
    const count = await prisma.libraryCollection.count({ where: { ownerUserId: viewer.id } });
    if (count >= COLLECTION_USER_QUOTA) {
      return { ok: false, status: 429, error: `You've reached the limit of ${COLLECTION_USER_QUOTA} collections.` };
    }
  }

  const slug = await uniqueCollectionSlug(slugifyTitle(fields.title));
  const max = await prisma.libraryCollection.aggregate({ _max: { position: true } });
  const created = await prisma.libraryCollection.create({
    data: {
      slug,
      title: fields.title,
      description: fields.description,
      ownerUserId: viewer.id,
      official: viewer.isAdmin,
      position: (max._max.position ?? 0) + 1,
    },
    select: { id: true, slug: true },
  });
  auditIfAdmin(viewer, 'library.collection.create', created.id, fields.title);
  return { ok: true, value: created };
}

/** A collection the viewer is allowed to manage, or an error. */
async function requireManageable(viewer: Viewer, id: string) {
  if (!viewer) return { ok: false as const, status: 401, error: 'You must be signed in.' };
  const row = await prisma.libraryCollection.findUnique({
    where: { id },
    select: { id: true, ownerUserId: true },
  });
  if (!row) return { ok: false as const, status: 404, error: 'Collection not found.' };
  if (!viewer.isAdmin && row.ownerUserId !== viewer.id) {
    return { ok: false as const, status: 403, error: 'You can only edit your own collections.' };
  }
  return { ok: true as const, row };
}

export async function updateCollection(
  viewer: Viewer,
  id: string,
  input: { title?: string; description?: string },
): Promise<CollectionResult<{ slug: string }>> {
  const access = await requireManageable(viewer, id);
  if (!access.ok) return access;
  const data: { title?: string; description?: string } = {};
  if (typeof input.title === 'string' || typeof input.description === 'string') {
    const fields = validateCollectionFields({
      title: input.title ?? 'placeholder',
      description: input.description,
    });
    if (typeof input.title === 'string') {
      if (!fields.ok) return { ok: false, status: 422, error: fields.error };
      data.title = fields.title;
    }
    if (typeof input.description === 'string') {
      if (!fields.ok && input.title === undefined) return { ok: false, status: 422, error: fields.error };
      data.description = (input.description ?? '').trim();
    }
  }
  if (Object.keys(data).length === 0) return { ok: false, status: 400, error: 'Nothing to update.' };
  const updated = await prisma.libraryCollection.update({ where: { id }, data, select: { slug: true } });
  auditIfAdmin(viewer, 'library.collection.update', id, Object.keys(data).join(','));
  return { ok: true, value: updated };
}

export async function deleteCollection(viewer: Viewer, id: string): Promise<CollectionResult<true>> {
  const access = await requireManageable(viewer, id);
  if (!access.ok) return access;
  await prisma.libraryCollection.delete({ where: { id } });
  auditIfAdmin(viewer, 'library.collection.delete', id);
  return { ok: true, value: true };
}

/** Whether the viewer may add this book slug (admins: any resolvable; users: own uploads). */
async function viewerOwnsBook(viewer: Viewer, bookSlug: string): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.isAdmin) {
    if (getLibraryBook(bookSlug)) return true;
    const doc = await prisma.libraryDocument.findUnique({ where: { slug: bookSlug }, select: { id: true } });
    return Boolean(doc);
  }
  const doc = await prisma.libraryDocument.findUnique({
    where: { slug: bookSlug },
    select: { uploadedByUserId: true },
  });
  return Boolean(doc && doc.uploadedByUserId === viewer.id);
}

export async function addItem(viewer: Viewer, id: string, bookSlug: string): Promise<CollectionResult<true>> {
  const access = await requireManageable(viewer, id);
  if (!access.ok) return access;
  if (!(await viewerOwnsBook(viewer, bookSlug))) {
    return { ok: false, status: 403, error: 'You can only add your own books to a collection.' };
  }
  const count = await prisma.libraryCollectionItem.count({ where: { collectionId: id } });
  if (count >= COLLECTION_ITEM_CAP) {
    return { ok: false, status: 429, error: `A collection can hold at most ${COLLECTION_ITEM_CAP} books.` };
  }
  const max = await prisma.libraryCollectionItem.aggregate({
    where: { collectionId: id },
    _max: { position: true },
  });
  // Idempotent: the (collectionId, bookSlug) unique constraint dedupes re-adds.
  await prisma.libraryCollectionItem.upsert({
    where: { collectionId_bookSlug: { collectionId: id, bookSlug } },
    create: { collectionId: id, bookSlug, position: (max._max.position ?? 0) + 1 },
    update: {},
  });
  auditIfAdmin(viewer, 'library.collection.add-item', id, bookSlug);
  return { ok: true, value: true };
}

export async function removeItem(viewer: Viewer, id: string, bookSlug: string): Promise<CollectionResult<true>> {
  const access = await requireManageable(viewer, id);
  if (!access.ok) return access;
  await prisma.libraryCollectionItem
    .delete({ where: { collectionId_bookSlug: { collectionId: id, bookSlug } } })
    .catch(() => {});
  auditIfAdmin(viewer, 'library.collection.remove-item', id, bookSlug);
  return { ok: true, value: true };
}

/** Reorder a collection's books to the given slug order. */
export async function reorderItems(viewer: Viewer, id: string, slugs: string[]): Promise<CollectionResult<true>> {
  const access = await requireManageable(viewer, id);
  if (!access.ok) return access;
  await prisma.$transaction(
    slugs.map((bookSlug, index) =>
      prisma.libraryCollectionItem.updateMany({
        where: { collectionId: id, bookSlug },
        data: { position: index },
      }),
    ),
  );
  auditIfAdmin(viewer, 'library.collection.reorder', id, `${slugs.length} books`);
  return { ok: true, value: true };
}

/** Build the image prompt for a collection cover from its title + description. */
function coverPrompt(title: string, description: string): string {
  const extra = description.trim() ? ` The collection is about: ${description.trim()}.` : '';
  return (
    `Cover artwork for a curated book series titled "${title}".${extra} ` +
    `A single cohesive, atmospheric illustration evoking a shelf of related books — ` +
    `rich painterly lighting, elegant and professional, portrait orientation. ` +
    `Absolutely no text, no letters, no words, no titles anywhere in the image.`
  );
}

/**
 * Generate an AI cover for a collection via xAI (Grok image API), store it at the
 * collection's cover key and record it on the row. Owner-or-admin only. Returns
 * the served cover URL. Best-effort: any generation failure is a clean error, the
 * collection simply keeps its placeholder cover.
 */
export async function generateCollectionCover(
  viewer: Viewer,
  id: string,
): Promise<CollectionResult<{ coverUrl: string }>> {
  const access = await requireManageable(viewer, id);
  if (!access.ok) return access;
  if (!isCollectionCoverConfigured()) {
    return { ok: false, status: 503, error: 'Cover generation is not configured.' };
  }
  const row = await prisma.libraryCollection.findUnique({
    where: { id },
    select: { title: true, description: true },
  });
  if (!row) return { ok: false, status: 404, error: 'Collection not found.' };

  try {
    const res = await xai.images.generate({ model: XAI_IMAGE_MODEL, prompt: coverPrompt(row.title, row.description), n: 1 });
    const url = res.data?.[0]?.url;
    if (!url) return { ok: false, status: 502, error: 'Image generation returned nothing.' };
    const fetched = await fetch(url);
    if (!fetched.ok) return { ok: false, status: 502, error: 'Could not download the generated image.' };
    const buffer = Buffer.from(await fetched.arrayBuffer());
    if (!validateImageBuffer(buffer).ok) return { ok: false, status: 502, error: 'Generated image was invalid.' };

    const ext = detectImageExt(buffer);
    const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const key = libraryCoverKey(id);
    await putObject(key, buffer, contentType);
    await prisma.libraryCollection.update({ where: { id }, data: { coverKey: key } });
    auditIfAdmin(viewer, 'library.collection.cover', id);
    return { ok: true, value: { coverUrl: libraryCoverUrl(id) } };
  } catch (err) {
    console.error('generateCollectionCover failed:', err);
    return { ok: false, status: 502, error: 'Image generation failed. Try again.' };
  }
}

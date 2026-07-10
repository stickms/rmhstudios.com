/**
 * RMH Studios — Static library → object storage migration (server-only).
 *
 * Moves the bundled library PDFs (and their rendered covers) into our own
 * object-storage key space as curated LibraryDocument rows so the catalog can
 * live entirely on S3 and the legacy delivery can be dropped later.
 *
 * Where the source bytes come from: in production the bundled `public/library`
 * files are NOT on the app container's disk — they're stripped from the image
 * (Dockerfile) and served from R2 behind the CDN. So we fetch each book from
 * where it's actually served (its public/CDN URL, or the site origin) and fall
 * back to reading `public/library` off disk for local dev. The fetched bytes are
 * gzip-compressed before upload, like user uploads.
 *
 * The migration is:
 *   - idempotent — keyed by `originFilename` (unique), so re-runs skip done books;
 *   - safe — preserves each book's slug, title, description, pages and TOC, so
 *     existing /library/<slug> links keep resolving;
 *   - best-effort — a single failed book is recorded and skipped, never aborting.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma.server';
import { putObject, deleteObject } from '@/lib/storage/s3.server';
import { CDN_BASE } from '@/lib/storage/asset';
import { listLibraryBooks } from './library';
import { libraryPdfKey, libraryCoverKey } from './keys';
import { compressPdfForStorage, isGzipped } from './compress.server';

export type MigrationSummary = {
  migrated: number;
  skipped: number;
  failed: number;
  /** A few human-readable failure reasons, for surfacing in the admin UI. */
  errors: string[];
};

const PUBLIC_LIBRARY_DIR = path.resolve(process.cwd(), 'public', 'library');

/** Join a base origin and an absolute path into one clean URL. */
function joinUrl(base: string, p: string): string {
  return base.replace(/\/+$/, '') + (p.startsWith('/') ? p : `/${p}`);
}

type Source = { type: 'url'; value: string } | { type: 'file'; value: string };

/** Try each source in order; return the first that yields bytes, else throw. */
async function loadAsset(sources: Source[], label: string): Promise<Buffer> {
  const errors: string[] = [];
  for (const src of sources) {
    try {
      if (src.type === 'url') {
        const res = await fetch(src.value);
        if (!res.ok) throw new Error(`${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      }
      return await fs.readFile(src.value);
    } catch (err) {
      errors.push(`${src.type}:${src.value} (${(err as Error).message})`);
    }
  }
  throw new Error(`could not load ${label} — tried ${errors.join('; ')}`);
}

/** A DB-only unique slug (the static slug is preferred; suffix only on clash). */
async function uniqueDbSlug(base: string): Promise<string> {
  const exists = async (s: string) =>
    (await prisma.libraryDocument.findUnique({ where: { slug: s }, select: { id: true } })) !== null;
  if (!(await exists(base))) return base;
  let n = 2;
  while (await exists(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Migrate one static book into storage + a LibraryDocument row. */
async function migrateBook(
  book: ReturnType<typeof listLibraryBooks>[number],
  baseUrl: string | null
): Promise<void> {
  // PDF: book.url is the CDN URL (absolute in prod) or a relative public path.
  const pdfSources: Source[] = [];
  if (/^https?:\/\//i.test(book.url)) pdfSources.push({ type: 'url', value: book.url });
  if (baseUrl) pdfSources.push({ type: 'url', value: joinUrl(baseUrl, `/library/${encodeURIComponent(book.filename)}`) });
  pdfSources.push({ type: 'file', value: path.join(PUBLIC_LIBRARY_DIR, book.filename) });
  const raw = await loadAsset(pdfSources, `pdf for ${book.filename}`);

  const id = crypto.randomUUID();
  const pdfKey = libraryPdfKey(id);
  let coverKey: string | null = null;

  const storedPdf = compressPdfForStorage(raw);
  await putObject(pdfKey, storedPdf, 'application/pdf', isGzipped(storedPdf) ? 'gzip' : undefined);

  // Cover: coverUrl is a relative public path (e.g. /library/covers/foo.jpg).
  if (book.coverUrl) {
    const coverName = decodeURIComponent(book.coverUrl.split('/').pop() ?? '');
    const coverSources: Source[] = [];
    if (CDN_BASE) coverSources.push({ type: 'url', value: joinUrl(CDN_BASE, book.coverUrl) });
    if (baseUrl) coverSources.push({ type: 'url', value: joinUrl(baseUrl, book.coverUrl) });
    if (coverName) coverSources.push({ type: 'file', value: path.join(PUBLIC_LIBRARY_DIR, 'covers', coverName) });
    const coverBuf = await loadAsset(coverSources, `cover for ${book.filename}`).catch(() => null);
    if (coverBuf) {
      coverKey = libraryCoverKey(id);
      await putObject(coverKey, coverBuf, 'image/jpeg');
    }
  }

  try {
    await prisma.libraryDocument.create({
      data: {
        id,
        slug: await uniqueDbSlug(book.slug),
        title: book.title,
        description: book.description ?? '',
        pages: book.pages ?? 0,
        pdfKey,
        coverKey,
        sizeBytes: raw.length,
        official: true,
        originFilename: book.filename,
        toc: book.toc?.length ? (book.toc as unknown as object) : undefined,
      },
    });
  } catch (err) {
    // Lost a race (originFilename/slug already taken) or DB write failed — roll
    // back the objects we just wrote so storage doesn't leak.
    await deleteObject(pdfKey).catch(() => {});
    if (coverKey) await deleteObject(coverKey).catch(() => {});
    throw err;
  }
}

/**
 * Migrate every not-yet-migrated static book. `baseUrl` is the origin to fetch
 * relative public assets from (the request origin for the admin trigger, or
 * BETTER_AUTH_URL for the background run).
 */
export async function migrateStaticLibraryToS3(
  opts: { baseUrl?: string | null } = {}
): Promise<MigrationSummary> {
  const baseUrl = opts.baseUrl ?? process.env.BETTER_AUTH_URL ?? null;
  const books = listLibraryBooks();
  const done = new Set(
    (
      await prisma.libraryDocument.findMany({
        where: { originFilename: { not: null } },
        select: { originFilename: true },
      })
    )
      .map((r: { originFilename: string | null }) => r.originFilename)
      .filter((f: string | null): f is string => Boolean(f))
  );

  const summary: MigrationSummary = { migrated: 0, skipped: 0, failed: 0, errors: [] };
  for (const book of books) {
    if (done.has(book.filename)) {
      summary.skipped++;
      continue;
    }
    try {
      await migrateBook(book, baseUrl);
      summary.migrated++;
    } catch (err) {
      summary.failed++;
      const msg = `${book.filename}: ${(err as Error).message}`;
      if (summary.errors.length < 5) summary.errors.push(msg);
      console.error(`[library:migrate] failed to migrate ${msg}`);
    }
  }
  return summary;
}

/** True when at least one static book hasn't been migrated yet. */
export async function hasUnmigratedStaticBooks(): Promise<boolean> {
  const total = listLibraryBooks().length;
  if (total === 0) return false;
  const migrated = await prisma.libraryDocument.count({ where: { originFilename: { not: null } } });
  return migrated < total;
}

// ── Lazy, once-per-process auto-migration ──────────────────────────────────
let autoMigrateStarted = false;

/**
 * Kick off the migration in the background, at most once per process. Returns
 * immediately; callers (the bookshelf loader) never wait on it. Errors are
 * swallowed and logged so a storage hiccup can't break page loads.
 */
export function ensureLibraryMigrated(): void {
  if (autoMigrateStarted) return;
  autoMigrateStarted = true; // set before awaiting so concurrent loads run once
  void (async () => {
    try {
      if (!(await hasUnmigratedStaticBooks())) return;
      const summary = await migrateStaticLibraryToS3();
      if (summary.migrated || summary.failed) {
        console.warn(
          `[library:migrate] auto-migration done — migrated ${summary.migrated}, ` +
            `skipped ${summary.skipped}, failed ${summary.failed}`
        );
      }
    } catch (err) {
      console.error('[library:migrate] auto-migration error:', err);
    }
  })();
}

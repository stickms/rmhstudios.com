/**
 * RMH Studios — Static library → object storage migration (server-only).
 *
 * Moves the bundled `public/library` PDFs (and their rendered covers) into object
 * storage as curated LibraryDocument rows so the catalog can live entirely on S3
 * and the on-disk files can be dropped later. The migration is:
 *   - idempotent — keyed by `originFilename` (unique), so re-runs skip done books;
 *   - safe — preserves each book's slug, title, description, pages and TOC, so
 *     existing /library/<slug> links keep resolving;
 *   - compressed — PDFs are gzipped before upload, like user uploads.
 *
 * It runs automatically (lazily, once per process, in the background) the first
 * time the bookshelf is loaded, and can also be triggered from the admin edit
 * mode. When object storage isn't configured it falls back to the local
 * `.uploads` dir (same as every other upload), so dev still works.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma.server';
import { putObject, deleteObject } from '@/lib/storage/s3.server';
import { listLibraryBooks } from './library';
import { libraryPdfKey, libraryCoverKey } from './keys';
import { compressPdfForStorage } from './compress.server';

export type MigrationSummary = { migrated: number; skipped: number; failed: number };

const PUBLIC_LIBRARY_DIR = path.resolve(process.cwd(), 'public', 'library');

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
async function migrateBook(book: ReturnType<typeof listLibraryBooks>[number]): Promise<void> {
  const pdfPath = path.join(PUBLIC_LIBRARY_DIR, book.filename);
  const raw = await fs.readFile(pdfPath); // throws if the bundled file is absent

  const id = crypto.randomUUID();
  const pdfKey = libraryPdfKey(id);
  let coverKey: string | null = null;

  await putObject(pdfKey, compressPdfForStorage(raw), 'application/pdf');

  if (book.coverUrl) {
    const coverName = decodeURIComponent(book.coverUrl.split('/').pop() ?? '');
    if (coverName) {
      const coverBuf = await fs
        .readFile(path.join(PUBLIC_LIBRARY_DIR, 'covers', coverName))
        .catch(() => null);
      if (coverBuf) {
        coverKey = libraryCoverKey(id);
        await putObject(coverKey, coverBuf, 'image/jpeg');
      }
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
 * Migrate every not-yet-migrated static book. Best-effort: a single failed book
 * (e.g. its bundled file is gone) is counted and skipped, never aborting the run.
 */
export async function migrateStaticLibraryToS3(): Promise<MigrationSummary> {
  const books = listLibraryBooks();
  const done = new Set(
    (
      await prisma.libraryDocument.findMany({
        where: { originFilename: { not: null } },
        select: { originFilename: true },
      })
    )
      .map((r) => r.originFilename)
      .filter((f): f is string => Boolean(f))
  );

  const summary: MigrationSummary = { migrated: 0, skipped: 0, failed: 0 };
  for (const book of books) {
    if (done.has(book.filename)) {
      summary.skipped++;
      continue;
    }
    try {
      await migrateBook(book);
      summary.migrated++;
    } catch (err) {
      summary.failed++;
      console.error(`[library:migrate] failed to migrate ${book.filename}:`, err);
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

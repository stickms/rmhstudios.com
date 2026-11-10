/**
 * Contracts for the admin library manager, /api/admin/library (redesign audit C1).
 * Client-safe: types only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { LibraryBook } from '@/lib/library/library';
import type { MigrationSummary } from '@/lib/library/migrate.server';
import type {
  adminBookPatchSchema,
  adminReorderBooksSchema,
} from '@/lib/library/admin-library-schema';

/** Every book, hidden ones included. */
export const adminLibraryListApi = endpoint<{ res: { books: LibraryBook[] } }>()({
  method: 'GET',
  path: '/api/admin/library',
});

/** Persist a manual order: each id's `position` becomes its index. */
export const adminLibraryReorderApi = endpoint<{
  body: z.infer<typeof adminReorderBooksSchema>;
  res: { ok: true };
}>()({ method: 'POST', path: '/api/admin/library/reorder' });

/** Move bundled static PDFs into object storage (idempotent). */
export const adminLibraryMigrateApi = endpoint<{ res: { ok: true } & MigrationSummary }>()({
  method: 'POST',
  path: '/api/admin/library/migrate',
});

/** Edit metadata, curate, hide or clear a report. */
export const adminLibraryPatchApi = endpoint<{
  body: z.infer<typeof adminBookPatchSchema>;
  res: { ok: true; slug: string };
}>()({ method: 'PATCH', path: '/api/admin/library/$id' });

export const adminLibraryDeleteApi = endpoint<{ res: { ok: true } }>()({
  method: 'DELETE',
  path: '/api/admin/library/$id',
});

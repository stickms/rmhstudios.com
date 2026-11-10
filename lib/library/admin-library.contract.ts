/**
 * Contracts for the admin library manager, /api/admin/library (redesign audit C1).
 * Client-safe: types only.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { LibraryBook } from '@/lib/library/library';
import type { MigrationSummary } from '@/lib/library/migrate.server';
import type { QuotaRequestView } from '@/lib/library/quota.server';
import type { StorageHealth } from '@/lib/library/storage-health.server';
import type {
  adminBookPatchSchema,
  adminQuotaDecisionSchema,
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

/** Pending upload-quota appeals. */
export const adminQuotaRequestsApi = endpoint<{ res: { requests: QuotaRequestView[] } }>()({
  method: 'GET',
  path: '/api/admin/library/quota-requests',
});

/** Approve or deny one appeal; `grantedTotal` is the new cap on approval. */
export const adminQuotaDecideApi = endpoint<{
  body: z.infer<typeof adminQuotaDecisionSchema>;
  res: { ok: true };
}>()({ method: 'POST', path: '/api/admin/library/quota-requests' });

/** Is library storage durable, and are any uploaded objects missing? */
export const adminStorageHealthApi = endpoint<{ res: StorageHealth }>()({
  method: 'GET',
  path: '/api/admin/library/storage-health',
});

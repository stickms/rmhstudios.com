/**
 * Contracts for /api/bulk (redesign audit C1, batch 7). Client-safe. A 402
 * answers the membership upgrade envelope; read its fields off `HttpError.body`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { BulkOperationView } from '@/lib/bulk/types';

export const listBulkOperationsApi = endpoint<{
  res: { operations: BulkOperationView[] };
}>()({ method: 'GET', path: '/api/bulk' });

/** Ask a running operation to stop. 409 `{ reason: 'not-cancellable' }` when it is not running. */
export const cancelBulkOperationApi = endpoint<{
  res: { ok: true; operation: BulkOperationView | null };
}>()({ method: 'DELETE', path: '/api/bulk/$id' });

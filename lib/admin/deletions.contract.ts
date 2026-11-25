/**
 * Contracts for /api/admin/deletions (admin only). Client-safe: types only, by `import type`.
 * No response carries an e-mail address, an error message or a stack.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { AdminDeletions, RetryErasureResult } from '@/lib/admin/deletions';

/** Waiting and overdue deletions with what the hold paused, and the last 30 days' finished count per day. */
export const listAdminDeletionsApi = endpoint<{
  res: AdminDeletions;
}>()({
  method: 'GET',
  path: '/api/admin/deletions',
});

/** Run the erasure of one overdue account now. Refused when it is not overdue or a run already holds the claim. */
export const retryAdminErasureApi = endpoint<{
  res: RetryErasureResult;
}>()({
  method: 'POST',
  path: '/api/admin/deletions/$userId/retry',
});

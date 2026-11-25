/**
 * Contracts for the lists a member is on (s13-11). Client-safe: the shapes come from `lists-on.ts`, the query is
 * validated server-side.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { ListsOnPage } from '@/lib/lists/lists-on';

/** The public and unlisted lists that include the caller, newest addition first. Never cached. */
export const listsOnApi = endpoint<{
  query: { cursor?: string | undefined };
  res: ListsOnPage;
}>()({
  method: 'GET',
  path: '/api/lists/on',
});

/** Leave a list for good: the owner cannot add the caller back. 404 for a list the caller is not on or cannot see. */
export const leaveListApi = endpoint<{
  res: { ok: true };
}>()({
  method: 'POST',
  path: '/api/lists/$id/leave',
});

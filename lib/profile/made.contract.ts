/**
 * Contract for GET /api/profile/:id/made (sprint 12, feature 07). Client-safe: types only.
 * `:id` is the user id. 404 for an unknown, deleted or banned member and for a pair blocked in either direction, all
 * with the same body.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { MadeResponse } from '@/lib/profile/made';

export const getMadeApi = endpoint<{
  query: {
    /** Comma-separated `MadeKind`s; omitted means every kind. */
    kinds?: string | undefined;
  };
  res: MadeResponse;
}>()({
  method: 'GET',
  path: '/api/profile/$id/made',
});

/**
 * Contracts for a Log's revision history (s03-05). Client-safe: types only, by `import type`.
 * Admin-only; a Log that does not exist, and a revision that is not one of its own, answer 404.
 */
import type { RevisionDetail, RevisionSummary } from '@/lib/blog/publication.server';
import { endpoint } from '@/lib/contract/endpoint';

/** The saved versions of a Log, newest first (at most 50). */
export const listBlogRevisionsApi = endpoint<{
  res: {
    revisions: RevisionSummary[];
  };
}>()({
  method: 'GET',
  path: '/api/admin/blog/$slug/revisions',
});

/** One saved version in full. */
export const getBlogRevisionApi = endpoint<{
  res: {
    revision: RevisionDetail;
  };
}>()({
  method: 'GET',
  path: '/api/admin/blog/$slug/revisions/$id',
});

/**
 * Contracts for the community wiki (s09-04): /api/community-pages. Client-safe: request types come from the zod
 * schemas and response types from the server module, both by `import type`, so no zod ships to the client.
 *
 * Refusals: a page the viewer may not see is a 404 (a private community's pages are for its members); a community
 * ban or timeout is a 403 carrying `code` (`community_banned` / `community_timed_out`) and `endsAt`; an edit based on
 * an older version than the current one is a 409.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { CommunityPageDTO, CommunityPageSummary, RevisionDTO } from '@/lib/communities/pages.server';
import type {
  communityPageCreateSchema,
  communityPageListQuerySchema,
  communityPageRollbackSchema,
  communityPageUpdateSchema,
} from '@/lib/communities/pages-schema';

/**
 * `?communitySlug=` (or `communityId`) lists the pages, pinned first. Adding `slug` returns that one page instead,
 * with `canEdit` and the reason when it is false.
 */
export const listCommunityPagesApi = endpoint<{
  query: z.infer<typeof communityPageListQuerySchema>;
  res: { pages: CommunityPageSummary[] } | CommunityPageDTO;
}>()({ method: 'GET', path: '/api/community-pages' });

/** 201. Moderators only. */
export const createCommunityPageApi = endpoint<{
  body: z.infer<typeof communityPageCreateSchema>;
  res: CommunityPageDTO;
}>()({ method: 'POST', path: '/api/community-pages' });

/** Edit; subject to the page's `editPolicy`. `baseUpdatedAt` is the version the editor started from (409 when stale). */
export const updateCommunityPageApi = endpoint<{
  body: z.infer<typeof communityPageUpdateSchema>;
  res: CommunityPageDTO;
}>()({ method: 'PATCH', path: '/api/community-pages/$id' });

/** Moderators only; the history goes with the page. */
export const deleteCommunityPageApi = endpoint<{
  res: { ok: true };
}>()({ method: 'DELETE', path: '/api/community-pages/$id' });

/**
 * A page's history, newest edit first. Each row is the text as it was BEFORE that editor's change, carrying their id
 * and summary; the current text is on the page.
 */
export const listCommunityPageRevisionsApi = endpoint<{
  res: { revisions: RevisionDTO[] };
}>()({ method: 'GET', path: '/api/community-pages/$id/revisions' });

/** Restore the text a revision holds; the current text becomes a revision of its own. */
export const rollbackCommunityPageApi = endpoint<{
  body: z.infer<typeof communityPageRollbackSchema>;
  res: CommunityPageDTO;
}>()({ method: 'POST', path: '/api/community-pages/$id/revisions' });

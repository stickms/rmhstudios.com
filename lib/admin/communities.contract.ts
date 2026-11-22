/**
 * Contracts for /api/admin/communities (admin only). Client-safe: types only, by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AdminCommunityDetail, AdminCommunityList, AdminCommunityRow } from '@/lib/admin/communities';
import type { delistCommunityBody, listCommunitiesQuery } from '@/lib/admin/communities-schema';

/** The communities with their figures, most members first (50 a page, keyset). */
export const listAdminCommunitiesApi = endpoint<{
  query: z.infer<typeof listCommunitiesQuery>;
  res: AdminCommunityList;
}>()({
  method: 'GET',
  path: '/api/admin/communities',
});

/** One community: its moderators and their last action, the last 20 mod-log entries and its open reports. */
export const getAdminCommunityApi = endpoint<{
  res: AdminCommunityDetail;
}>()({
  method: 'GET',
  path: '/api/admin/communities/$slug',
});

/** Take a community out of discovery, with a reason its moderators read. Members and the page are unchanged. */
export const delistCommunityApi = endpoint<{
  body: z.infer<typeof delistCommunityBody>;
  res: { community: AdminCommunityRow };
}>()({
  method: 'POST',
  path: '/api/admin/communities/$slug/delist',
});

/** Return a community to discovery. */
export const relistCommunityApi = endpoint<{
  res: { community: AdminCommunityRow };
}>()({
  method: 'POST',
  path: '/api/admin/communities/$slug/relist',
});

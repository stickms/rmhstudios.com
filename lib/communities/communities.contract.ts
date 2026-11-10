/**
 * Contracts for /api/communities (redesign audit C1). Client-safe: request
 * types come from the zod schemas and response types from the server modules,
 * both by `import type`, so no zod ships to the client.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { CommunityListItem } from '@/lib/communities.server';
import type {
  CommunityAnnouncement,
  CommunityDetail,
  CommunityFeedResult,
} from '@/lib/community.server';
import type {
  createAnnouncementBody,
  createCommunityBody,
  joinCommunityBody,
} from './communities-schema';

export interface CommunityMember {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
  role: string;
  joinedAt: string;
}

/** Browse communities, most members first; `q` filters by name. */
export const listCommunitiesApi = endpoint<{
  query: { q?: string };
  res: { communities: CommunityListItem[] };
}>()({ method: 'GET', path: '/api/communities' });

/** 201. */
export const createCommunityApi = endpoint<{
  body: z.infer<typeof createCommunityBody>;
  res: { success: true; slug: string };
}>()({ method: 'POST', path: '/api/communities' });

export const getCommunityApi = endpoint<{ res: CommunityDetail }>()({
  method: 'GET',
  path: '/api/communities/$slug',
});

/** First page when no cursor; `flair` filters to one flair. */
export const communityFeedApi = endpoint<{
  query: { cursor?: string; limit?: number; flair?: string };
  res: CommunityFeedResult;
}>()({ method: 'GET', path: '/api/communities/$slug/feed' });

/** Toggles membership; `joined` is the resulting state. A private community needs `invite`. */
export const joinCommunityApi = endpoint<{
  body: z.infer<typeof joinCommunityBody>;
  res: { success: true; joined: boolean };
}>()({ method: 'POST', path: '/api/communities/$slug/join' });

export const communityMembersApi = endpoint<{
  res: { viewerRole: string | null; createdById: string; members: CommunityMember[] };
}>()({ method: 'GET', path: '/api/communities/$slug/members' });

export const setCommunityMemberRoleApi = endpoint<{
  body: { role: 'MEMBER' | 'MOD' };
  res: { success: true; role: 'MEMBER' | 'MOD' };
}>()({ method: 'PATCH', path: '/api/communities/$slug/members/$userId' });

export const removeCommunityMemberApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/communities/$slug/members/$userId',
});

/** 201. Mods and admins only. */
export const createCommunityAnnouncementApi = endpoint<{
  body: z.infer<typeof createAnnouncementBody>;
  res: { announcement: CommunityAnnouncement };
}>()({ method: 'POST', path: '/api/communities/$slug/announcements' });

export const deleteCommunityAnnouncementApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/communities/$slug/announcements/$id',
});

export const listCommunityAnnouncementsApi = endpoint<{
  res: { announcements: CommunityAnnouncement[] };
}>()({ method: 'GET', path: '/api/communities/$slug/announcements' });

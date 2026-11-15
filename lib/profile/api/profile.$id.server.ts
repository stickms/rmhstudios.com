import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getProfileApi } from '@/lib/profile/profile.contract';
import { getProfile } from '@/lib/profile.server';

export const route = apiRoute('/api/profile/$id', {
  GET: implement(
    getProfileApi,
    {
      auth: 'optional',
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'profile', message: 'Rate limited' },
    },
    async ({ params, userId: viewerId, isAdmin: viewerIsAdmin }) => {
      try {
        const payload = await getProfile(params.id, { id: viewerId, isAdmin: viewerIsAdmin });
        if (!payload) return Response.json({ error: 'User not found' }, { status: 404 });
        return payload;
      } catch (error) {
        console.error('Profile fetch error:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});

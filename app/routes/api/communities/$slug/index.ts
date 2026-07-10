import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getCommunity } from '@/lib/community.server';

/** GET /api/communities/$slug — community details + viewer membership. */
export const Route = createFileRoute('/api/communities/$slug/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const community = await getCommunity(params.slug, session?.user.id ?? null);
        if (!community) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(community);
      },
    },
  },
});

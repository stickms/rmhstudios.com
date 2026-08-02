import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getCommunity } from '@/lib/community.server';

/** GET /api/communities/$slug — community details + viewer membership. */
export const Route = createFileRoute('/api/communities/$slug/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const community = await getCommunity(params.slug, session?.user.id ?? null);
        if (!community) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(community);
      }),
    },
  },
});

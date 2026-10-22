import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getSharedMarathon } from '@/lib/tools/tools.server';

/** GET /api/marathon-lists/shared/:shareId — public read-only list behind a share link. */
export const Route = createFileRoute('/api/marathon-lists/shared/$shareId')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async ({ params }) => {
        const list = await getSharedMarathon(params.shareId);
        if (!list) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ list }, { headers: { 'Cache-Control': 'public, max-age=30' } });
      }),
    },
  },
});

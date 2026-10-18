import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { SHARE_CODE_RE } from '@/lib/worlds/schema';
import { viewSnapshot } from '@/lib/worlds/snapshots.server';

/** GET /api/worlds/visit/:code — a published world, for visitors (signed-in or not). */
export const Route = createFileRoute('/api/worlds/visit/$code')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const code = params.code?.toUpperCase() ?? '';
        const view = SHARE_CODE_RE.test(code) ? await viewSnapshot(code, userId) : null;
        if (!view) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(view, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
    },
  },
});

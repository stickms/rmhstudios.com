import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { SHARE_CODE_RE } from '@/lib/worlds/schema';
import { waterGarden } from '@/lib/worlds/snapshots.server';

/** POST /api/worlds/visit/:code/water — water a garden (once per visitor per day). */
export const Route = createFileRoute('/api/worlds/visit/$code/water')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { policy: 'write', limit: 20, windowMs: 60_000, prefix: 'world-water' } },
        async ({ userId, params }) => {
          const code = params.code?.toUpperCase() ?? '';
          if (!SHARE_CODE_RE.test(code))
            return Response.json({ error: 'Not found' }, { status: 404 });
          const res = await waterGarden(code, userId);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});

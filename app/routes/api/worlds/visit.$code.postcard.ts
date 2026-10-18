import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { SHARE_CODE_RE, postcardSchema } from '@/lib/worlds/schema';
import { leavePostcard } from '@/lib/worlds/snapshots.server';

/** POST /api/worlds/visit/:code/postcard — leave (or replace) your postcard. */
export const Route = createFileRoute('/api/worlds/visit/$code/postcard')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { policy: 'write', limit: 10, windowMs: 60_000, prefix: 'world-postcard' },
          body: postcardSchema,
        },
        async ({ userId, params, body }) => {
          const code = params.code?.toUpperCase() ?? '';
          if (!SHARE_CODE_RE.test(code))
            return Response.json({ error: 'Not found' }, { status: 404 });
          const res = await leavePostcard(code, userId, body.body);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ id: res.id }, { status: 201 });
        },
      ),
    },
  },
});

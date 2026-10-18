import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { LIVERY_CODE_RE } from '@/lib/neon-driftway/livery';
import { getMemberLivery, saveMemberLivery } from '@/lib/neon-driftway/livery.server';

/**
 * GET /api/neon-driftway/livery — the caller's saved livery code (or null).
 * PUT /api/neon-driftway/livery — save it. Cosmetic only; never part of a score.
 */
export const Route = createFileRoute('/api/neon-driftway/livery')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const code = await getMemberLivery(userId);
        return Response.json({ code }, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      PUT: defineHandler(
        { rateLimit: 'write', body: z.object({ code: z.string().regex(LIVERY_CODE_RE) }) },
        async ({ userId, body }) => {
          await saveMemberLivery(userId, body.code);
          return Response.json({ code: body.code });
        },
      ),
    },
  },
});

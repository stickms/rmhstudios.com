import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { nextBirthdayForHandle } from '@/lib/gifting/birthday.server';

/** GET /api/birthday/next?handle= — a member's next opted-in birthday (to schedule a gift for it). */
export const Route = createFileRoute('/api/birthday/next')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: z.object({ handle: z.string().trim().min(1).max(40) }) },
        async ({ query }) => {
          const next = await nextBirthdayForHandle(query.handle);
          if (!next) return Response.json({ error: 'No birthday shared' }, { status: 404 });
          return Response.json(next, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
    },
  },
});

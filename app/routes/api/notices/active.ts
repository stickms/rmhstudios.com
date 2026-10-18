import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { noticeFor } from '@/lib/ops/notices.server';

/** GET /api/notices/active?locale= — the newest undismissed notice this member matches. */
export const Route = createFileRoute('/api/notices/active')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: z.object({ locale: z.string().max(8).optional() }) },
        async ({ userId, query }) => {
          const notice = await noticeFor(userId, query?.locale);
          return Response.json({ notice }, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
    },
  },
});

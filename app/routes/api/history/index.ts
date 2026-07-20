import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { HISTORY_ENTITY_TYPES, type HistoryEntityType } from '@/lib/history/constants';
import { listHistory, clearHistory } from '@/lib/history/history.server';

const pauseSchema = z.object({ paused: z.boolean() });

/**
 * GET    /api/history?type=&cursor= — the caller's history (paginated).
 * DELETE /api/history — clear all history.
 * PUT    /api/history { paused } — pause/resume recording (privacy control).
 */
export const Route = createFileRoute('/api/history/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const url = new URL(request.url);
          const typeParam = url.searchParams.get('type');
          const type =
            typeParam && (HISTORY_ENTITY_TYPES as readonly string[]).includes(typeParam)
              ? (typeParam as HistoryEntityType)
              : undefined;
          const cursor = url.searchParams.get('cursor') ?? undefined;

          const [result, profile] = await Promise.all([
            listHistory(session.user.id, { type, cursor }),
            prisma.userProfile.findUnique({
              where: { userId: session.user.id },
              select: { historyPaused: true },
            }),
          ]);
          return Response.json({ ...result, paused: profile?.historyPaused ?? false });
        } catch (error) {
          console.error('History list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          await clearHistory(session.user.id);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('History clear error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      PUT: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'history-settings',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => null);
          const parsed = pauseSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          await prisma.userProfile.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, historyPaused: parsed.data.paused },
            update: { historyPaused: parsed.data.paused },
          });
          return Response.json({ paused: parsed.data.paused });
        } catch (error) {
          console.error('History settings error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});

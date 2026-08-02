import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
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
      GET: defineHandler({}, async ({ request, session }) => {
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
      }),

      DELETE: defineHandler({}, async ({ session }) => {
        await clearHistory(session.user.id);
        return Response.json({ ok: true });
      }),

      PUT: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'history-settings' },
          body: pauseSchema,
        },
        async ({ session, body }) => {
          await prisma.userProfile.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, historyPaused: body.paused },
            update: { historyPaused: body.paused },
          });
          return Response.json({ paused: body.paused });
        },
      ),
    },
  },
});

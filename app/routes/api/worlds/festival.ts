import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { cached } from '@/lib/cached.server';
import { prisma } from '@/lib/prisma.server';
import { festivalOn, latestFestival, nextFestival } from '@/lib/rmh-farming-sim/festivals';

/**
 * GET /api/worlds/festival — today's Farming Sim festival (if any), the next
 * one, and the contest board for the latest festival. Scores are written only
 * by the authoritative socket handler.
 */
export const Route = createFileRoute('/api/worlds/festival')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          cache: { visibility: 'public', maxAge: 30, sMaxAge: 30, staleWhileRevalidate: 120 },
        },
        async () => {
          const now = new Date();
          const active = festivalOn(now);
          const latest = latestFestival(now);
          const next = nextFestival(now);
          const top = await cached(`farm-festival:top:${latest.key}`, 30_000, async () => {
            const rows = await prisma.farmFestivalEntry.findMany({
              where: { festivalKey: latest.key },
              orderBy: [{ score: 'desc' }, { updatedAt: 'asc' }],
              take: 10,
              select: { name: true, score: true },
            });
            return rows;
          });
          return Response.json({
            active: active ? { key: active.key, id: active.id, name: active.name } : null,
            next: { id: next.festival.id, name: next.festival.name, daysAway: next.daysAway },
            board: { key: latest.key, name: latest.name, live: active?.key === latest.key, top },
          });
        },
      ),
    },
  },
});

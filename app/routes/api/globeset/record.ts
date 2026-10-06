import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

/**
 * The signed-in player's GlobeSet versus record.
 *
 * Written by the games hub when a race finishes
 * (`server/socket-server/handlers/globeset.ts`), read here so the results
 * screen can show it. Separate from `/api/daily-puzzles/results`, which is
 * scoped to one day of the SOLO puzzle — a race and a daily run are different
 * contests and one endpoint for both would make neither number mean anything.
 *
 * `auth: 'optional'` rather than `'required'`: an anonymous racer is a
 * first-class player in a room and simply has no durable record, so the honest
 * answer for them is "no record yet", not a 401 the results screen would have
 * to special-case.
 */
export const Route = createFileRoute('/api/globeset/record')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'optional',
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'globeset-record' },
        },
        async ({ userId }) => {
          if (!userId) return Response.json({ record: null });

          const row = await prisma.globeSetPlayer.findUnique({
            where: { userId },
            select: { racesPlayed: true, racesWon: true, bestRaceMs: true, setsFound: true },
          });

          return Response.json({ record: row ?? null });
        },
      ),
    },
  },
});

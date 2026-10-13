import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, notFound } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { GAME_IDS, listGameNights } from '@/lib/competitive/game-night.server';
import { sanitizeLobbyCode } from '@/lib/lobby-link';

const createSchema = z.object({
  title: z.string().trim().min(2).max(80),
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(20).max(360),
  minutesPerGame: z.number().int().min(5).max(120),
  games: z
    .array(z.string())
    .min(1)
    .max(12)
    .refine((g) => g.every((id) => GAME_IDS.has(id)), 'Unknown game'),
});

const patchSchema = z.object({
  id: z.string().min(1).max(64),
  /** Set (or clear with null) the live join code for one game. */
  lobby: z.object({ gameId: z.string(), code: z.string().nullable() }).optional(),
  enabled: z.boolean().optional(),
});

/**
 * GET   /api/game-night — enabled rotations with now-playing / up-next.
 * POST  /api/game-night — admin: define a weekly rotation.
 * PATCH /api/game-night — admin: post the live lobby code for a game, or disable the night.
 */
export const Route = createFileRoute('/api/game-night/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read' }, async () =>
        Response.json(
          { nights: await listGameNights() },
          { headers: { 'Cache-Control': 'no-store' } },
        ),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: createSchema },
        async ({ body }) => {
          const night = await prisma.gameNight.create({ data: body, select: { id: true } });
          return Response.json({ id: night.id }, { status: 201 });
        },
      ),
      PATCH: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: patchSchema },
        async ({ body }) => {
          const night = await prisma.gameNight.findUnique({ where: { id: body.id } });
          if (!night) return notFound('Game night not found');
          const data: { enabled?: boolean; lobbyCodes?: Record<string, string> } = {};
          if (body.enabled !== undefined) data.enabled = body.enabled;
          if (body.lobby) {
            const list = Array.isArray(night.games) ? (night.games as unknown[]) : [];
            if (!list.includes(body.lobby.gameId)) {
              return Response.json({ error: 'Game is not in this rotation' }, { status: 400 });
            }
            const codes = { ...((night.lobbyCodes ?? {}) as Record<string, string>) };
            const clean = body.lobby.code === null ? null : sanitizeLobbyCode(body.lobby.code);
            if (body.lobby.code !== null && !clean) {
              return Response.json({ error: 'Invalid lobby code' }, { status: 400 });
            }
            if (clean) codes[body.lobby.gameId] = clean;
            else delete codes[body.lobby.gameId];
            data.lobbyCodes = codes;
          }
          await prisma.gameNight.update({ where: { id: night.id }, data });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});

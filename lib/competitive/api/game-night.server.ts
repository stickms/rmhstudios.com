import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { notFound } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import {
  createGameNightApi,
  listGameNightsApi,
  patchGameNightApi,
} from '@/lib/competitive/game-night.contract';
import { prisma } from '@/lib/prisma.server';
import { GAME_IDS, gameNightWhere, listGameNights } from '@/lib/competitive/game-night.server';
import { gameNightEventData, gameNightMeta } from '@/lib/calendar/event-model';
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
export const route = apiRoute('/api/game-night', {
  GET: implement(listGameNightsApi, { auth: 'none', rateLimit: 'read' }, async () =>
    Response.json({ nights: await listGameNights() }, { headers: { 'Cache-Control': 'no-store' } }),
  ),
  POST: implement(
    createGameNightApi,
    { auth: 'admin', rateLimit: 'write', body: createSchema },
    async ({ body }) => {
      const night = await prisma.event.create({
        data: { owner: 'PLATFORM', kind: 'game-night', title: body.title, ...gameNightEventData(body) },
        select: { id: true },
      });
      return Response.json({ id: night.id }, { status: 201 });
    },
  ),
  PATCH: implement(
    patchGameNightApi,
    { auth: 'admin', rateLimit: 'write', body: patchSchema },
    async ({ body }) => {
      const night = await prisma.event.findFirst({
        where: { id: body.id, ...gameNightWhere },
        select: { id: true, meta: true },
      });
      if (!night) return notFound('Game night not found');
      const meta = gameNightMeta(night.meta);
      const data: { visibility?: 'PUBLIC' | 'DRAFT'; meta?: typeof meta } = {};
      if (body.enabled !== undefined) data.visibility = body.enabled ? 'PUBLIC' : 'DRAFT';
      if (body.lobby) {
        if (!meta.games.includes(body.lobby.gameId)) {
          return Response.json({ error: 'Game is not in this rotation' }, { status: 400 });
        }
        const codes = { ...meta.lobbyCodes };
        const clean = body.lobby.code === null ? null : sanitizeLobbyCode(body.lobby.code);
        if (body.lobby.code !== null && !clean) {
          return Response.json({ error: 'Invalid lobby code' }, { status: 400 });
        }
        if (clean) codes[body.lobby.gameId] = clean;
        else delete codes[body.lobby.gameId];
        data.meta = { ...meta, lobbyCodes: codes };
      }
      await prisma.event.update({ where: { id: night.id }, data });
      return Response.json({ ok: true });
    },
  ),
});

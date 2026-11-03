import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { parseDay } from '@/lib/elections/calendar';
import { validateRoomConfig, roomNameSchema } from '@/lib/elections/room-config';
import { createRoom, listPublicRooms } from '@/lib/elections/rooms.server';

const listQuery = z.object({ cycle: z.string().max(10) });
const createBody = z.object({
  name: roomNameSchema,
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
  cycle: z.string().max(10),
  config: z.unknown().optional(),
});

/**
 * GET  /api/elections/rooms?cycle=  — public rooms for an election day (private rooms are never listed).
 * POST /api/elections/rooms         — create a room (signed in; 10 active per account).
 */
export const Route = createFileRoute('/api/elections/rooms/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', query: listQuery, cache: { visibility: 'public', maxAge: 5, sMaxAge: 10 }, etag: false, microCache: false, label: 'elections.rooms.list' },
        async ({ query }) => {
          const day = parseDay(query.cycle);
          if (!day) return Response.json({ error: 'Unknown election' }, { status: 400 });
          return Response.json({ rooms: await listPublicRooms(day.date) });
        },
      ),
      POST: defineHandler(
        { rateLimit: { limit: 6, windowMs: 3_600_000, prefix: 'elections:room:create' }, body: createBody, label: 'elections.rooms.create' },
        async ({ userId, body }) => {
          const day = parseDay(body.cycle);
          if (!day) return Response.json({ error: 'Unknown election' }, { status: 400 });
          let config;
          if (body.config !== undefined) {
            const v = validateRoomConfig(body.config);
            if (!v.ok) return Response.json({ error: v.error }, { status: 422 });
            config = v.config;
          }
          const res = await createRoom(userId, { name: body.name, visibility: body.visibility, electionDate: day.date, config });
          return res.ok ? Response.json({ room: res.room }, { status: 201 }) : Response.json({ error: res.error }, { status: res.status });
        },
      ),
    },
  },
});

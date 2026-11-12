import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import {
  deleteElectionRoomApi,
  getElectionRoomApi,
  updateElectionRoomApi,
} from '@/lib/elections/elections.contract';
import { isRoomCode, roomNameSchema, validateRoomConfig } from '@/lib/elections/room-config';
import { deleteRoom, getRoom, toRoomView, updateRoom } from '@/lib/elections/rooms.server';

const patchBody = z.object({
  name: roomNameSchema.optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  config: z.unknown().optional(),
});

/**
 * GET    /api/elections/rooms/:code — the room (anyone with the code; the code IS the capability).
 * PATCH  — host edits name / visibility / the shared screen (pushed live to everyone in the room).
 * DELETE — host (or a site admin) removes it.
 */
export const route = apiRoute('/api/elections/rooms/$code', {
  GET: implement(
    getElectionRoomApi,
    { auth: 'optional', rateLimit: 'read', label: 'elections.rooms.get' },
    async ({ params, userId }) => {
      const code = String(params.code ?? '').toUpperCase();
      if (!isRoomCode(code)) return Response.json({ error: 'Room not found.' }, { status: 404 });
      const row = await getRoom(code);
      if (!row) return Response.json({ error: 'Room not found.' }, { status: 404 });
      // Per-viewer (`mine`) and capability-gated: never cacheable by a shared cache.
      return Response.json(
        { room: toRoomView(row, userId) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    },
  ),
  PATCH: implement(
    updateElectionRoomApi,
    { rateLimit: 'write', body: patchBody, label: 'elections.rooms.update' },
    async ({ params, userId, body }) => {
      const code = String(params.code ?? '').toUpperCase();
      if (!isRoomCode(code)) return Response.json({ error: 'Room not found.' }, { status: 404 });
      let config;
      if (body.config !== undefined) {
        const v = validateRoomConfig(body.config);
        if (!v.ok) return Response.json({ error: v.error }, { status: 422 });
        config = v.config;
      }
      const res = await updateRoom(code, userId, {
        name: body.name,
        visibility: body.visibility,
        config,
      });
      return res.ok
        ? Response.json({ room: res.room })
        : Response.json({ error: res.error }, { status: res.status });
    },
  ),
  DELETE: implement(
    deleteElectionRoomApi,
    { rateLimit: 'write', label: 'elections.rooms.delete' },
    async ({ params, userId, isAdmin }) => {
      const code = String(params.code ?? '').toUpperCase();
      if (!isRoomCode(code)) return Response.json({ error: 'Room not found.' }, { status: 404 });
      const res = await deleteRoom(code, userId, isAdmin);
      return res.ok
        ? Response.json({ ok: true })
        : Response.json({ error: res.error }, { status: res.status });
    },
  ),
});

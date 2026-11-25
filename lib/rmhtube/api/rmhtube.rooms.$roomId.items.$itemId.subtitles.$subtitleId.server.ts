import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { getSubtitleCuesApi } from '@/lib/rmhtube/subtitles.contract';
import { readSubtitleCues } from '@/lib/rmhtube/subtitles.server';

const NOT_FOUND = () =>
  new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });

/**
 * One subtitle track's cues. Only a member in the room now (or its host) reads them; a stranger, a member who left, a
 * closed room and a room, item or subtitle that does not exist all get the same 404.
 */
export const route = apiRoute('/api/rmhtube/rooms/$roomId/items/$itemId/subtitles/$subtitleId', {
  GET: implement(getSubtitleCuesApi, { auth: 'required', rateLimit: 'read' }, async ({ userId, params }) => {
    const roomId = String(params.roomId ?? '');
    const itemId = String(params.itemId ?? '');
    const subtitleId = String(params.subtitleId ?? '');
    if (!roomId || !itemId || !subtitleId || roomId.length > 64 || itemId.length > 64 || subtitleId.length > 64) {
      return NOT_FOUND();
    }
    const track = await readSubtitleCues(prisma, { roomId, itemId, subtitleId, userId });
    if (!track) return NOT_FOUND();
    return Response.json(track, { headers: { 'Cache-Control': 'private, no-store' } });
  }),
});

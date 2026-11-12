import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { notFound } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { getPickemApi, setPickemApi } from '@/lib/competitive/pickem.contract';
import { getPickem, setPicks } from '@/lib/competitive/pickem.server';
import { PICK_ROLE_LIST } from '@/lib/competitive/pickem';

const bodySchema = z.object({
  picks: z
    .array(
      z.object({
        role: z.enum(PICK_ROLE_LIST as [string, ...string[]]),
        entrantId: z.string().min(1).max(64),
      }),
    )
    .max(4),
});

/**
 * GET /api/tournaments/:id/pickem — the viewer's card + leaderboard (single-elim only).
 * PUT /api/tournaments/:id/pickem — replace the viewer's card while registration is open.
 */
export const route = apiRoute('/api/tournaments/$id/pickem', {
  GET: implement(
    getPickemApi,
    { auth: 'optional', rateLimit: 'read' },
    async ({ params, userId }) => {
      const data = await getPickem(params.id, userId);
      if (!data) return notFound('No pick’em for this tournament');
      return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
  PUT: implement(
    setPickemApi,
    { rateLimit: 'write', body: bodySchema },
    async ({ params, userId, body }) => {
      const res = await setPicks(
        params.id,
        userId,
        body.picks as { role: 'CHAMPION' | 'FINALIST' | 'SEMI'; entrantId: string }[],
      );
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json({ ok: true });
    },
  ),
});

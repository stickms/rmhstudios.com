import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { playLightsOutBoardApi } from '@/lib/lights-out/boards.contract';
import { recordPlay } from '@/lib/lights-out/boards.server';

/** POST /api/lights-out/b/:id/play — the member's first press on a board: one play, however often it is sent. */
export const route = apiRoute('/api/lights-out/b/$id/play', {
  POST: implement(
    playLightsOutBoardApi,
    { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'lights-out-board-play' } },
    async ({ userId, params }) => {
      const r = await recordPlay(userId, params.id);
      if (!r.ok) return Response.json({ ...refusalBody(r.code) }, { status: r.status });
      return { ok: true as const, counted: r.counted };
    },
  ),
});

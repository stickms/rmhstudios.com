/**
 * `POST /api/rmhtype/texts/$textId/runs` — one finished run on a saved text. The browser scored it; the server
 * re-checks it against the stored body. Nothing here reaches XP, streaks, the daily board, profiles or
 * achievements.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { recordRmhTypeTextRunApi } from '@/lib/rmhtype/texts.contract';
import { textParams, textRunBody } from '@/lib/rmhtype/texts-schema';
import { recordTextRun } from '@/lib/rmhtype/texts.server';

export const route = apiRoute('/api/rmhtype/texts/$textId/runs', {
  POST: implement(
    recordRmhTypeTextRunApi,
    // Per member, not per address: one request per finished run.
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'rmhtype-text-run', limit: 60 }, body: textRunBody },
    async ({ userId, params, body }) => {
      const parsed = textParams.safeParse(params);
      if (!parsed.success) return Response.json({ error: 'Text not found' }, { status: 404 });
      const result = await recordTextRun(userId, parsed.data.textId, body);
      if (!result.ok) {
        return result.reason === 'not-found'
          ? Response.json({ error: 'Text not found' }, { status: 404 })
          : Response.json({ error: 'Invalid run' }, { status: 400 });
      }
      return Response.json({ text: result.text, newBest: result.newBest, ghost: result.ghost });
    },
  ),
});

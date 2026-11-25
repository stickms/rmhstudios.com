import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { setJamThemeCandidatesApi } from '@/lib/competitive/jam-themes.contract';
import { setCandidatesSchema } from '@/lib/competitive/jam-themes-schema';
import { refusalBody } from '@/lib/errors/codes';
import { setCandidates } from '@/lib/competitive/jam-themes.server';

/** PUT /api/jams/$slug/theme-candidates — admin: replace the shortlist (3 to 12) before the first mark exists. */
export const route = apiRoute('/api/jams/$slug/theme-candidates', {
  PUT: implement(
    setJamThemeCandidatesApi,
    {
      auth: 'admin',
      rateLimit: 'write',
      body: setCandidatesSchema,
    },
    async ({ params, userId, body }) => {
      const res = await setCandidates(userId, params.slug, body.candidates);
      if (!res.ok)
        return Response.json(res.code ? refusalBody(res.code) : { error: res.error }, { status: res.status });
      return Response.json({
        ok: true as const,
      });
    },
  ),
});

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { notFound } from '@/lib/api/handler.server';
import { getJamSuggestionsApi, suggestJamThemeApi } from '@/lib/competitive/jam-suggestions.contract';
import { suggestThemeSchema } from '@/lib/competitive/jam-suggestions-schema';
import { suggestTheme, suggestionsView } from '@/lib/competitive/jam-suggestions.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';

/**
 * GET  /api/jams/:slug/suggestions — your own suggestions; an admin also gets every one, grouped by text.
 * POST /api/jams/:slug/suggestions — suggest a theme (up to three, before the vote opens; the `comment` timeout holds).
 */
export const route = apiRoute('/api/jams/$slug/suggestions', {
  GET: implement(getJamSuggestionsApi, { rateLimit: 'read' }, async ({ params, userId, isAdmin }) => {
    const view = await suggestionsView(params.slug, userId, isAdmin);
    if (!view) return notFound('Jam not found');
    return Response.json({ view }, { headers: { 'Cache-Control': 'private, no-store' } });
  }),
  POST: implement(
    suggestJamThemeApi,
    { rateLimit: 'write', body: suggestThemeSchema },
    async ({ params, userId, body }) => {
      const restricted = await restrictionResponse(userId, 'comment');
      if (restricted) return restricted;
      const res = await suggestTheme(params.slug, userId, body.text);
      if (!res.ok) {
        return Response.json(refusalBody(res.code, res.params), { status: ERROR_CODES[res.code].http });
      }
      return Response.json({ suggestion: res.suggestion }, { status: 201 });
    },
  ),
});

import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { publishThemeBody } from '@/lib/themes/themes-schema';
import { publishThemeApi } from '@/lib/themes/themes.contract';
import { publishTheme, ThemeError } from '@/lib/themes/themes.server';

/** POST /api/themes/:id/publish { priceCoins } — run the contrast gate + list. */
export const Route = createFileRoute('/api/themes/$id/publish')({
  server: {
    handlers: {
      POST: implement(
        publishThemeApi,
        {
          rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:themes/:id.publish' },
          body: publishThemeBody,
        },
        async ({ params, session, body }) => {
          try {
            await publishTheme(session.user.id, params.id, body.priceCoins);
          } catch (e) {
            if (e instanceof ThemeError) {
              const status =
                e.message === 'FORBIDDEN' || e.message === 'MEMBERS_ONLY'
                  ? 403
                  : e.message === 'NOT_FOUND'
                    ? 404
                    : 400;
              return Response.json({ error: e.message }, { status });
            }
            throw e;
          }
          return { ok: true as const };
        },
      ),
    },
  },
});

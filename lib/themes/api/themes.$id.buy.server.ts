import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { buyThemeApi } from '@/lib/themes/themes.contract';
import { buyTheme, ThemeError } from '@/lib/themes/themes.server';

/** POST /api/themes/:id/buy — purchase a published theme with coins. */
export const route = apiRoute('/api/themes/$id/buy', {
  POST: implement(
    buyThemeApi,
    { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'theme-buy' } },
    async ({ params, session }) => {
      try {
        const result = await buyTheme(session.user.id, params.id);
        return { ok: true as const, balance: result.balance };
      } catch (e) {
        if (e instanceof ThemeError) {
          const status = e.message === 'NOT_FOR_SALE' ? 404 : 400;
          return Response.json({ error: e.message }, { status });
        }
        throw e;
      }
    },
  ),
});

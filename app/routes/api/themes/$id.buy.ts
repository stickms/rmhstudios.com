import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { buyTheme, ThemeError } from '@/lib/themes/themes.server';

/** POST /api/themes/:id/buy — purchase a published theme with coins. */
export const Route = createFileRoute('/api/themes/$id/buy')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'theme-buy' } },
        async ({ params, session }) => {
          try {
            const result = await buyTheme(session.user.id, params.id);
            return Response.json({ ok: true, balance: result.balance });
          } catch (e) {
            if (e instanceof ThemeError) {
              const status = e.message === 'NOT_FOR_SALE' ? 404 : 400;
              return Response.json({ error: e.message }, { status });
            }
            throw e;
          }
        },
      ),
    },
  },
});

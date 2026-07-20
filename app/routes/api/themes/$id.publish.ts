import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { THEME_PRICE_MIN, THEME_PRICE_MAX } from '@/lib/themes/tokens';
import { publishTheme, ThemeError } from '@/lib/themes/themes.server';

const schema = z.object({ priceCoins: z.number().int().min(THEME_PRICE_MIN).max(THEME_PRICE_MAX) });

/** POST /api/themes/:id/publish { priceCoins } — run the contrast gate + list. */
export const Route = createFileRoute('/api/themes/$id/publish')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const body = await request.json().catch(() => null);
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await publishTheme(session.user.id, params.id, parsed.data.priceCoins);
          } catch (e) {
            if (e instanceof ThemeError) {
              return Response.json({ error: e.message }, { status: e.message === 'FORBIDDEN' ? 403 : e.message === 'NOT_FOUND' ? 404 : 400 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Theme publish error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});

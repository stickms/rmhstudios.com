import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { THEME_PRICE_MIN, THEME_PRICE_MAX } from '@/lib/themes/tokens';
import { publishTheme, ThemeError } from '@/lib/themes/themes.server';

const schema = z.object({ priceCoins: z.number().int().min(THEME_PRICE_MIN).max(THEME_PRICE_MAX) });

/** POST /api/themes/:id/publish { priceCoins } — run the contrast gate + list. */
export const Route = createFileRoute('/api/themes/$id/publish')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ request, params, session }) => {
        const body = await request.json().catch(() => null);
        const parsed = schema.safeParse(body);
        if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
        try {
          await publishTheme(session.user.id, params.id, parsed.data.priceCoins);
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
        return Response.json({ ok: true });
      }),
    },
  },
});

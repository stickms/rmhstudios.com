import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { themeTokensSchema } from '@/lib/themes/tokens';
import { listMyThemes, createTheme, ThemeError } from '@/lib/themes/themes.server';

const createSchema = z.object({ name: z.string().trim().min(1).max(40), tokens: themeTokensSchema });

/**
 * GET  /api/themes — the caller's themes.
 * POST /api/themes { name, tokens } — create a draft.
 */
export const Route = createFileRoute('/api/themes/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json({ themes: await listMyThemes(session.user.id) });
        } catch (error) {
          console.error('Themes list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 30, windowMs: 60_000, prefix: 'themes' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            const id = await createTheme(session.user.id, parsed.data.name, parsed.data.tokens);
            return Response.json({ id });
          } catch (e) {
            if (e instanceof ThemeError) return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
        } catch (error) {
          console.error('Theme create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});

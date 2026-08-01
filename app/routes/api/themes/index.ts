import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { themeTokensSchema } from '@/lib/themes/tokens';
import { listMyThemes, createTheme, ThemeError } from '@/lib/themes/themes.server';

const createSchema = z.object({
  name: z.string().trim().min(1).max(40),
  tokens: themeTokensSchema,
});

/**
 * GET  /api/themes — the caller's themes.
 * POST /api/themes { name, tokens } — create a draft.
 */
export const Route = createFileRoute('/api/themes/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        return Response.json({ themes: await listMyThemes(session.user.id) });
      }),
      POST: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'themes' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            const id = await createTheme(session.user.id, parsed.data.name, parsed.data.tokens);
            return Response.json({ id });
          } catch (e) {
            if (e instanceof ThemeError)
              return Response.json(
                { error: e.message },
                { status: e.message === 'MEMBERS_ONLY' ? 403 : 400 },
              );
            throw e;
          }
        },
      ),
    },
  },
});

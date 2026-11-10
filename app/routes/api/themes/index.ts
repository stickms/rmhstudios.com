import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { createThemeBody } from '@/lib/themes/themes-schema';
import { createThemeApi, listMyThemesApi } from '@/lib/themes/themes.contract';
import { listMyThemes, createTheme, ThemeError } from '@/lib/themes/themes.server';

/**
 * GET  /api/themes — the caller's themes.
 * POST /api/themes { name, tokens } — create a draft.
 */
export const Route = createFileRoute('/api/themes/')({
  server: {
    handlers: {
      GET: implement(listMyThemesApi, {}, async ({ session }) => {
        return { themes: await listMyThemes(session.user.id) };
      }),
      POST: implement(
        createThemeApi,
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'themes' }, body: createThemeBody },
        async ({ session, body }) => {
          try {
            const id = await createTheme(session.user.id, body.name, body.tokens);
            return { id };
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

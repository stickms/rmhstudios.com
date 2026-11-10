import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { updateThemeBody } from '@/lib/themes/themes-schema';
import { updateThemeApi } from '@/lib/themes/themes.contract';
import { getTheme, updateTheme, deleteOrDelistTheme, ThemeError } from '@/lib/themes/themes.server';

/**
 * GET    /api/themes/:id — a theme (draft visible to author only).
 * PUT    /api/themes/:id — edit name / tokens (tokens editable while DRAFT).
 * DELETE /api/themes/:id — delete a draft, or delist a published theme.
 */
export const Route = createFileRoute('/api/themes/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const theme = await getTheme(params.id, session?.user.id ?? null);
        if (!theme) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(theme);
      }),
      PUT: implement(
        updateThemeApi,
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'themes' }, body: updateThemeBody },
        async ({ params, session, body }) => {
          try {
            await updateTheme(session.user.id, params.id, body);
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
      DELETE: defineHandler(
        { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:themes/:id' } },
        async ({ params, session }) => {
          try {
            await deleteOrDelistTheme(session.user.id, params.id);
          } catch (e) {
            if (e instanceof ThemeError) {
              return Response.json(
                { error: e.message },
                { status: e.message === 'FORBIDDEN' ? 403 : 404 },
              );
            }
            throw e;
          }
          return Response.json({ ok: true });
        },
      ),
    },
  },
});

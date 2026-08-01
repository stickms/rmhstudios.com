import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { themeTokensSchema } from '@/lib/themes/tokens';
import { getTheme, updateTheme, deleteOrDelistTheme, ThemeError } from '@/lib/themes/themes.server';

const updateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  tokens: themeTokensSchema.optional(),
});

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
      PUT: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'themes' } },
        async ({ request, params, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = updateSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await updateTheme(session.user.id, params.id, parsed.data);
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
        },
      ),
      DELETE: defineHandler({}, async ({ params, session }) => {
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
      }),
    },
  },
});

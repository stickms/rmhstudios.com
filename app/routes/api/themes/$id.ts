import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const theme = await getTheme(params.id, session?.user.id ?? null);
          if (!theme) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(theme);
        } catch (error) {
          console.error('Theme fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 30, windowMs: 60_000, prefix: 'themes' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = updateSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await updateTheme(session.user.id, params.id, parsed.data);
          } catch (e) {
            if (e instanceof ThemeError) {
              return Response.json({ error: e.message }, { status: e.message === 'FORBIDDEN' ? 403 : e.message === 'NOT_FOUND' ? 404 : 400 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Theme update error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          try {
            await deleteOrDelistTheme(session.user.id, params.id);
          } catch (e) {
            if (e instanceof ThemeError) {
              return Response.json({ error: e.message }, { status: e.message === 'FORBIDDEN' ? 403 : 404 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Theme delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});

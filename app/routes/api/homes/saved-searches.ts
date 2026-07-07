/**
 * RMHHomes — saved searches API.
 *
 *   GET    /api/homes/saved-searches         → list the user's saved searches
 *   POST   /api/homes/saved-searches         → create one from the current query
 *   PATCH  /api/homes/saved-searches         → toggle alerts { id, alertsEnabled }
 *   DELETE /api/homes/saved-searches?id=...   → delete one
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  listSavedSearches,
  saveSearch,
  deleteSavedSearch,
  setSearchAlerts,
} from '@/lib/homes/saved.server';

const createSchema = z.object({
  name: z.string().min(1).max(80),
  query: z.string().max(500),
  location: z.string().max(200),
  alertsEnabled: z.boolean().optional(),
});

const patchSchema = z.object({
  id: z.string().min(1).max(64),
  alertsEnabled: z.boolean(),
});

export const Route = createFileRoute('/api/homes/saved-searches')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const searches = await listSavedSearches(session.user.id);
          return Response.json({ searches });
        } catch (error) {
          console.error('Homes saved-searches GET error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, {
            limit: 30,
            windowMs: 60_000,
            prefix: 'homes-save-search',
          });
          if (!allowed) return Response.json({ error: 'Too many requests.' }, { status: 429 });

          const parsed = createSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: 'Invalid search' }, { status: 400 });
          }

          const result = await saveSearch(session.user.id, parsed.data);
          if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
          return Response.json({ ok: true, id: result.id });
        } catch (error) {
          console.error('Homes saved-searches POST error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      PATCH: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const parsed = patchSchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json({ error: 'Invalid request' }, { status: 400 });
          }

          await setSearchAlerts(session.user.id, parsed.data.id, parsed.data.alertsEnabled);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Homes saved-searches PATCH error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const id = new URL(request.url).searchParams.get('id')?.trim();
          if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

          await deleteSavedSearch(session.user.id, id);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Homes saved-searches DELETE error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});

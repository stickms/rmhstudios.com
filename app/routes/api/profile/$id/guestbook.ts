import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { guestbookModeSchema, signGuestbookSchema } from '@/lib/guestbook/schema';
import { readGuestbook, setGuestbookMode, signGuestbook } from '@/lib/guestbook/guestbook.server';

/**
 * Profile guestbook (plan U15).
 *
 * GET   — a page of entries plus the viewer's ability to sign. Public read
 *         (subject to the owner's mode and blocks), so `auth: 'optional'`.
 * POST  — sign it. Body: { body }.
 * PATCH — owner only: set who may sign. Body: { mode }.
 */
const pageQuery = z.object({ cursor: z.string().max(64).optional() });

export const Route = createFileRoute('/api/profile/$id/guestbook')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: pageQuery },
        async ({ userId, params, query }) => {
          const page = await readGuestbook(params.id, userId, query.cursor ?? null);
          if (!page) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'guestbook-sign' },
          body: signGuestbookSchema,
        },
        async ({ userId, params, body }) => {
          const result = await signGuestbook(params.id, userId, body.body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ id: result.id }, { status: 201 });
        },
      ),
      PATCH: defineHandler(
        { rateLimit: 'write', body: guestbookModeSchema },
        async ({ userId, params, body }) => {
          if (params.id !== userId) return Response.json({ error: 'Forbidden' }, { status: 403 });
          await setGuestbookMode(userId, body.mode);
          return Response.json({ mode: body.mode });
        },
      ),
    },
  },
});

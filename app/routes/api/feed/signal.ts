import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { feedSignalSchema, normalizeTag } from '@/lib/feed/signals';
import { recordSignal, removeSignal, getSignals } from '@/lib/feed/signals.server';

/**
 * GET    /api/feed/signal — the caller's feed signals (for the settings surface).
 * POST   /api/feed/signal { kind, targetId } — record a signal (idempotent).
 * DELETE /api/feed/signal { kind, targetId } — remove a signal (idempotent).
 */
export const Route = createFileRoute('/api/feed/signal')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json(await getSignals(session.user.id));
        } catch (error) {
          console.error('Feed signals list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 60, windowMs: 60_000, prefix: 'feed-signal' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = feedSignalSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          const targetId = parsed.data.kind === 'less_author' ? parsed.data.targetId : normalizeTag(parsed.data.targetId);
          await recordSignal(session.user.id, parsed.data.kind, targetId);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Feed signal record error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const body = await request.json().catch(() => null);
          const parsed = feedSignalSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          const targetId = parsed.data.kind === 'less_author' ? parsed.data.targetId : normalizeTag(parsed.data.targetId);
          await removeSignal(session.user.id, parsed.data.kind, targetId);
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Feed signal remove error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});

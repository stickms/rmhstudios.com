import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
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
      GET: defineHandler({}, async ({ session }) => {
        return Response.json(await getSignals(session.user.id));
      }),
      POST: defineHandler(
        { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'feed-signal' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = feedSignalSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          const targetId =
            parsed.data.kind === 'less_author'
              ? parsed.data.targetId
              : normalizeTag(parsed.data.targetId);
          await recordSignal(session.user.id, parsed.data.kind, targetId);
          return Response.json({ ok: true });
        },
      ),
      DELETE: defineHandler({}, async ({ request, session }) => {
        const body = await request.json().catch(() => null);
        const parsed = feedSignalSchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
        const targetId =
          parsed.data.kind === 'less_author'
            ? parsed.data.targetId
            : normalizeTag(parsed.data.targetId);
        await removeSignal(session.user.id, parsed.data.kind, targetId);
        return Response.json({ ok: true });
      }),
    },
  },
});

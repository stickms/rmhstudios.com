import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getYearlyWrapped } from '@/lib/wrapped.server';

/** GET /api/wrapped?year= — the signed-in user's year-in-review. */
export const Route = createFileRoute('/api/wrapped')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'wrapped' } },
        async ({ request, session }) => {
          const url = new URL(request.url);
          const now = new Date();
          const requested = parseInt(url.searchParams.get('year') || '', 10);
          // Clamp to a sane range; default to the current year.
          const year =
            Number.isFinite(requested) && requested >= 2020 && requested <= now.getUTCFullYear()
              ? requested
              : now.getUTCFullYear();

          const wrapped = await getYearlyWrapped(session.user.id, year);
          return Response.json(wrapped);
        },
      ),
    },
  },
});

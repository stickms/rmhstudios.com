import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { createHighlightSchema } from '@/lib/reading/schema';
import { createHighlight, listMyHighlights } from '@/lib/reading/highlights.server';

/**
 * GET  /api/reading/highlights — the caller's highlights across all documents,
 *      newest first (the "My highlights" tab).
 * POST /api/reading/highlights — create a highlight, optionally with a note and
 *      optionally public (public ones feed the L8 popular-passage counters).
 */
const pageQuery = z.object({ cursor: z.string().max(64).optional() });

export const Route = createFileRoute('/api/reading/highlights/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read', query: pageQuery }, async ({ userId, query }) => {
        const page = await listMyHighlights(userId, query.cursor ?? null);
        return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      POST: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'reading-highlight' },
          body: createHighlightSchema,
        },
        async ({ userId, body }) => {
          const result = await createHighlight(userId, {
            kind: body.kind,
            key: body.key,
            unit: body.unit,
            exact: body.exact,
            prefix: body.prefix,
            suffix: body.suffix,
            start: body.start,
            end: body.end,
            version: body.version,
            note: body.note,
            isPublic: body.isPublic,
            passages: body.passages,
          });
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ highlight: result.highlight }, { status: 201 });
        },
      ),
    },
  },
});

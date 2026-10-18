import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { glossaryTermSchema } from '@/lib/reading/schema';
import { createTerm, listGlossary } from '@/lib/reading/glossary.server';

/** GET/POST /api/admin/reading/glossary — manage the lore glossary (L6). */
export const Route = createFileRoute('/api/admin/reading/glossary/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () => {
        return Response.json(
          { terms: await listGlossary() },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: glossaryTermSchema },
        async ({ userId, body }) => {
          const result = await createTerm(userId, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ term: result.term }, { status: 201 });
        },
      ),
    },
  },
});

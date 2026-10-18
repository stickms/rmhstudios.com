import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { glossaryTermSchema } from '@/lib/reading/schema';
import { deleteTerm, updateTerm } from '@/lib/reading/glossary.server';

/** PATCH/DELETE /api/admin/reading/glossary/:id */
export const Route = createFileRoute('/api/admin/reading/glossary/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: glossaryTermSchema },
        async ({ params, body }) => {
          const result = await updateTerm(params.id, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json({ term: result.term });
        },
      ),
      DELETE: defineHandler({ auth: 'admin', rateLimit: 'write' }, async ({ params }) => {
        const ok = await deleteTerm(params.id);
        if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ ok: true });
      }),
    },
  },
});

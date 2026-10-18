import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { deleteGrid, getGrid } from '@/lib/party/connections.server';

/**
 * GET    /api/connections/grids/:id — the grid to play (no answers) plus the caller's progress.
 * DELETE /api/connections/grids/:id — author (or admin) removes it.
 */
export const Route = createFileRoute('/api/connections/grids/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const grid = await getGrid(params.id, userId);
        if (!grid) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ grid }, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, isAdmin, params }) => {
        const ok = await deleteGrid(userId, params.id, isAdmin);
        return ok
          ? Response.json({ ok: true })
          : Response.json({ error: 'Not found' }, { status: 404 });
      }),
    },
  },
});

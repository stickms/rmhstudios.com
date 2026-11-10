import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { listCapsulesApi } from '@/lib/scheduled/scheduled.contract';
import { listCapsules } from '@/lib/posts-plus/capsules.server';

/** GET /api/scheduled/capsules - the caller's sealed time capsules and recently opened ones (Z7). */
export const Route = createFileRoute('/api/scheduled/capsules')({
  server: {
    handlers: {
      GET: implement(listCapsulesApi, { rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await listCapsules(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
    },
  },
});

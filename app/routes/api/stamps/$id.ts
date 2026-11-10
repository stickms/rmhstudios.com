import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { deleteStampApi } from '@/lib/profile/stamps.contract';
import { deleteOwnStamp } from '@/lib/profile/stamps.server';

/** DELETE /api/stamps/$id — the creator deletes their own stamp; it leaves every wall (P5). */
export const Route = createFileRoute('/api/stamps/$id')({
  server: {
    handlers: {
      DELETE: implement(deleteStampApi, { rateLimit: 'write' }, async ({ userId, params }) => {
        const ok = await deleteOwnStamp(userId, params.id);
        return ok
          ? Response.json({ success: true })
          : Response.json({ error: 'Not found' }, { status: 404 });
      }),
    },
  },
});

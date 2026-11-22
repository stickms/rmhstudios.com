/** `DELETE /api/rmhtype/ghosts` — delete every ghost the caller has. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { clearRmhTypeGhostsApi } from '@/lib/rmhtype/ghost.contract';
import { clearGhosts } from '@/lib/rmhtype/ghost.server';

export const route = apiRoute('/api/rmhtype/ghosts', {
  DELETE: implement(clearRmhTypeGhostsApi, { rateLimit: 'write' }, async ({ userId }) =>
    Response.json({ deleted: await clearGhosts(userId) }),
  ),
});

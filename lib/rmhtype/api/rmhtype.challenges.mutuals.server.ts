/** `GET /api/rmhtype/challenges/mutuals` — the members the caller can challenge. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listRmhTypeChallengeMutualsApi } from '@/lib/rmhtype/challenges.contract';
import { listMutuals } from '@/lib/rmhtype/challenges.server';

export const route = apiRoute('/api/rmhtype/challenges/mutuals', {
  GET: implement(listRmhTypeChallengeMutualsApi, { rateLimit: 'read' }, async ({ userId }) => ({
    mutuals: await listMutuals(userId),
  })),
});

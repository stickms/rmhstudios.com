import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { claimQuestApi } from '@/lib/battlepass/battlepass.contract';
import { claimQuest } from '@/lib/quests/engine.server';

/** POST /api/quests/$id/claim — claim a completed quest's reward. */
export const route = apiRoute('/api/quests/$id/claim', {
  POST: implement(
    claimQuestApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'quest-claim' } },
    async ({ params, session }) => {
      const reward = await claimQuest(session.user.id, params.id);
      if (!reward) return Response.json({ error: 'Quest not claimable' }, { status: 400 });
      return { success: true as const, ...reward };
    },
  ),
});

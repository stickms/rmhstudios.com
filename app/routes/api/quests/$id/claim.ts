import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { claimQuestApi } from '@/lib/battlepass/battlepass.contract';
import { claimQuest } from '@/lib/quests/engine.server';

/** POST /api/quests/$id/claim — claim a completed quest's reward. */
export const Route = createFileRoute('/api/quests/$id/claim')({
  server: {
    handlers: {
      POST: implement(
        claimQuestApi,
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'quest-claim' } },
        async ({ params, session }) => {
          const reward = await claimQuest(session.user.id, params.id);
          if (!reward) return Response.json({ error: 'Quest not claimable' }, { status: 400 });
          return { success: true as const, ...reward };
        },
      ),
    },
  },
});

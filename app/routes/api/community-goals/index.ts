import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createCommunityGoalSchema } from '@/lib/economy/community-goal';
import {
  CommunityGoalError,
  createCommunityGoal,
  listCommunityGoals,
} from '@/lib/economy/community-goal.server';

/**
 * GET  /api/community-goals — site-wide goal pots with the viewer's own pledges (C5).
 * POST /api/community-goals — admin: open a new goal.
 */
export const Route = createFileRoute('/api/community-goals/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, session }) =>
        Response.json(
          {
            goals: await listCommunityGoals(userId),
            viewerIsAdmin: !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin,
          },
          { headers: { 'Cache-Control': 'private, no-store' } },
        ),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: createCommunityGoalSchema },
        async ({ userId, body }) => {
          try {
            const id = await createCommunityGoal(userId, body);
            return Response.json({ id }, { status: 201 });
          } catch (e) {
            if (e instanceof CommunityGoalError)
              return Response.json({ error: e.code }, { status: 400 });
            throw e;
          }
        },
      ),
    },
  },
});

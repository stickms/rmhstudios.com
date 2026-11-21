import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listMyFeedbackApi } from '@/lib/feedback/inbox.contract';
import { listMine } from '@/lib/feedback/inbox.server';

/** GET /api/feedback/mine — the signed-in member's own feedback, with any reply. Never another member's rows. */
export const route =
  apiRoute(
    '/api/feedback/mine',
    {
      GET: implement(
        listMyFeedbackApi,
        {
          rateLimit:
            'read',
        },
        async ({
          userId,
        }) => ({
          rows: await listMine(
            userId,
          ),
        }),
      ),
    },
  );

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listAdminFeedbackApi } from '@/lib/feedback/inbox.contract';
import { listFeedbackQuerySchema } from '@/lib/feedback/inbox-schema';
import { listForAdmin } from '@/lib/feedback/inbox.server';

/** GET /api/admin/feedback?status=&category=&q=&after=&limit= — one page of feedback, newest first. Admin only. */
export const route =
  apiRoute(
    '/api/admin/feedback',
    {
      GET: implement(
        listAdminFeedbackApi,
        {
          auth: 'admin',
          rateLimit:
            'read',
          query:
            listFeedbackQuerySchema,
        },
        async ({
          query,
        }) =>
          listForAdmin(
            query,
          ),
      ),
    },
  );

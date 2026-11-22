import { apiRoute } from '@/lib/api/route.server';
import { apiError } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { getAdminFeedbackApi, updateAdminFeedbackApi } from '@/lib/feedback/inbox.contract';
import { FEEDBACK_ID, updateFeedbackBodySchema } from '@/lib/feedback/inbox-schema';
import { getForAdmin, updateFeedback } from '@/lib/feedback/inbox.server';

/** GET and PATCH /api/admin/feedback/$id — one row with its context, and one audited edit of it. Admin only. */
export const route = apiRoute('/api/admin/feedback/$id', {
  GET: implement(
    getAdminFeedbackApi,
    {
      auth: 'admin',
      rateLimit: 'read',
    },
    async ({ params }) => {
      if (!FEEDBACK_ID.test(params.id)) return apiError('Feedback not found.', 404);
      const feedback = await getForAdmin(params.id);
      return feedback
        ? {
            feedback,
          }
        : apiError('Feedback not found.', 404);
    },
  ),
  PATCH: implement(
    updateAdminFeedbackApi,
    {
      auth: 'admin',
      rateLimit: 'write',
      body: updateFeedbackBodySchema,
    },
    async ({ params, body, userId }) => {
      if (!FEEDBACK_ID.test(params.id)) return apiError('Feedback not found.', 404);
      const result = await updateFeedback(userId, params.id, body);
      return result ?? apiError('Feedback not found.', 404);
    },
  ),
});

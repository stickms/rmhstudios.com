import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { sendFeedbackApi } from '@/lib/feedback.contract';
import { feedbackSchema } from '@/lib/feedback-schema';
import { createFeedback } from '@/lib/feedback/inbox.server';

// The legacy admin GET was removed (no client called it): the inbox endpoints under /api/admin/feedback replace it.
export const route = apiRoute('/api/feedback', {
  POST: implement(
    sendFeedbackApi,
    {
      rateLimit: {
        limit: 3,
        windowMs: 10 * 60_000,
        prefix: 'feedback',
        message: 'Too many submissions. Please try again later.',
      },
      body: feedbackSchema,
      allowEmptyBody: true,
      invalid: (error) =>
        Response.json({ error: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 }),
    },
    async ({ session, body }) => {
      const feedback = await createFeedback(session.user.id, body);
      return {
        id: feedback.id,
        category: feedback.category,
        message: feedback.message,
        createdAt: feedback.createdAt.toISOString(),
        user: {
          name: feedback.user.name || feedback.user.handle || 'Unknown',
          image: feedback.user.image,
        },
      };
    },
  ),
});

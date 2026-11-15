import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { sendFeedbackApi } from '@/lib/feedback.contract';
import { prisma } from '@/lib/prisma.server';
import { feedbackSchema } from '@/lib/feedback-schema';

const FEEDBACK_LIST_CAP = 100;

export const route = apiRoute('/api/feedback', {
  // Admin only: the list is every submitter's name and message, and no
  // client calls it (the form only POSTs).
  GET: defineHandler({ auth: 'admin' }, async () => {
    // Bounded: the table grows with every submission; newest FEEDBACK_LIST_CAP rows, only the columns returned.
    const feedbacks = await prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: FEEDBACK_LIST_CAP,
      select: {
        id: true,
        category: true,
        message: true,
        createdAt: true,
        user: {
          select: { name: true, username: true, image: true },
        },
      },
    });

    const formatted = feedbacks.map((f: any) => ({
      id: f.id,
      category: f.category,
      message: f.message,
      createdAt: f.createdAt,
      user: {
        name: f.user.name || f.user.username || 'Unknown',
        image: f.user.image,
      },
    }));

    return Response.json(formatted);
  }),
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
      const { category, message } = body;

      const feedback = await prisma.feedback.create({
        data: {
          category,
          message,
          userId: session.user.id,
        },
        include: {
          user: {
            select: { name: true, username: true, image: true },
          },
        },
      });

      return {
        id: feedback.id,
        category: feedback.category,
        message: feedback.message,
        createdAt: feedback.createdAt.toISOString(),
        user: {
          name: feedback.user.name || feedback.user.username || 'Unknown',
          image: feedback.user.image,
        },
      };
    },
  ),
});

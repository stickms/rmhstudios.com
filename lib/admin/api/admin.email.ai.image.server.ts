import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminEmailAiImage } from '@/lib/admin/email.contract';
import { aiImageBodySchema } from '@/lib/email/campaign-schema';
import { generateEmailImage, isImageGenConfigured } from '@/lib/email/ai.server';

/**
 * POST /api/admin/email/ai/image — a picture for the email, themed on the draft.
 * Admin only, so no membership tier check (the feed's image route has one); the
 * site-wide daily image budget in `generatePostImage` still applies.
 */
export const route = apiRoute('/api/admin/email/ai/image', {
  POST: implement(
    adminEmailAiImage,
    {
      auth: 'admin',
      rateLimit: {
        limit: 6,
        windowMs: 60_000,
        scope: 'user',
        prefix: 'admin-email-ai-image',
      },
      body: aiImageBodySchema,
    },
    async ({ userId, body }) => {
      if (!isImageGenConfigured()) {
        return Response.json(
          {
            error: 'AI images are not available right now.',
          },
          {
            status: 503,
          },
        );
      }
      const url = await generateEmailImage({
        adminId: userId,
        subject: body.subject,
        body: body.body,
      });
      if (!url) {
        return Response.json(
          {
            error: "Couldn't generate an image right now. Try again.",
          },
          {
            status: 502,
          },
        );
      }
      return {
        url,
      };
    },
  ),
});

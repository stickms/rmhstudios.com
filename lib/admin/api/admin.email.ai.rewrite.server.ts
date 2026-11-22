import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { isAiConfigured } from '@/lib/ai/provider.server';
import { adminEmailAiRewrite } from '@/lib/admin/email.contract';
import { aiRewriteBodySchema } from '@/lib/email/campaign-schema';
import { rewriteEmailText } from '@/lib/email/ai.server';

/** POST /api/admin/email/ai/rewrite — rewrite the whole body or a highlighted passage. */
export const route = apiRoute('/api/admin/email/ai/rewrite', {
  POST: implement(
    adminEmailAiRewrite,
    {
      auth: 'admin',
      rateLimit: {
        policy: 'ai',
        scope: 'user',
        prefix: 'admin-email-ai',
      },
      body: aiRewriteBodySchema,
    },
    async ({ body }) => {
      if (!isAiConfigured()) {
        return Response.json(
          {
            error: 'AI writing is not available right now.',
          },
          {
            status: 503,
          },
        );
      }
      const text = await rewriteEmailText({
        text: body.text,
        action: body.action,
        subject: body.subject,
      });
      if (!text.trim())
        return Response.json(
          {
            error: 'Could not rewrite that. Try again.',
          },
          {
            status: 502,
          },
        );
      return {
        text,
      };
    },
  ),
});

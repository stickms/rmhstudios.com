import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { isAiConfigured } from '@/lib/ai/provider.server';
import { adminEmailAiDraft } from '@/lib/admin/email.contract';
import { aiDraftBodySchema } from '@/lib/email/campaign-schema';
import { draftEmailBody, draftEmailSubject } from '@/lib/email/ai.server';

/** POST /api/admin/email/ai/draft — draft the email's subject or body with AI. */
export const route = apiRoute('/api/admin/email/ai/draft', {
  POST: implement(
    adminEmailAiDraft,
    { auth: 'admin', rateLimit: { policy: 'ai', scope: 'user', prefix: 'admin-email-ai' }, body: aiDraftBodySchema },
    async ({ body }) => {
      if (!isAiConfigured()) {
        return Response.json({ error: 'AI writing is not available right now.' }, { status: 503 });
      }
      const input = { category: body.category, subject: body.subject, body: body.body };
      const text = body.target === 'subject' ? await draftEmailSubject(input) : await draftEmailBody(input);
      if (!text) return Response.json({ error: 'Could not write that. Try again.' }, { status: 502 });
      return { text };
    },
  ),
});

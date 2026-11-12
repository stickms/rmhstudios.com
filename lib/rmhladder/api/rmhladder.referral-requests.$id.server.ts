import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { respondSchema } from '@/lib/rmhladder/community-schema';
import { respondToRequest } from '@/lib/rmhladder/community.server';

/**
 * PATCH /api/rmhladder/referral-requests/$id — the offerer accepts or passes;
 * the applicant withdraws.
 */
export const route = apiRoute('/api/rmhladder/referral-requests/$id', {
  PATCH: defineHandler(
    { rateLimit: 'write', body: respondSchema },
    async ({ userId, params, body }) => {
      const result = await respondToRequest(userId, params.id!, body.action);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json(result.value);
    },
  ),
});

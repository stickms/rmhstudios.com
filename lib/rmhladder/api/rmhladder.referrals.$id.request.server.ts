import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { createRequestSchema } from '@/lib/rmhladder/community-schema';
import { createRequest } from '@/lib/rmhladder/community.server';

/** POST /api/rmhladder/referrals/$id/request — ask for a referral with a short pitch. */
export const route = apiRoute('/api/rmhladder/referrals/$id/request', {
  POST: defineHandler(
    {
      rateLimit: { limit: 10, windowMs: 3_600_000, prefix: 'ladder-referral-request' },
      body: createRequestSchema,
    },
    async ({ userId, params, body }) => {
      const result = await createRequest(userId, params.id!, body.pitch);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json(result.value, { status: 201 });
    },
  ),
});

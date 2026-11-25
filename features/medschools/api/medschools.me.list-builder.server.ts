import { isAiConfigured } from '@/lib/ai/provider.server';
import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { buildMedListApi } from '@features/medschools/medschools.contract';
import { buildList } from './builder/build.server';
import { buildListBody } from './stats-schemas';

/**
 * `POST /api/medschools/me/list-builder`: an AI-built school list (phase D). Signed in and personal, so it declares no
 * `cache` of any kind; nothing in the request or the result is stored (the only trace is the `AiUsage` row the provider
 * writes). One build is one of the member's daily Q&A questions, under the Q&A share of the monthly budget
 * (`buildList` runs `admitQuestion` before any model call). Rate-limited like `ask`.
 */
const BUILD_LIMIT = { policy: 'ai', limit: 6, windowMs: 60_000, prefix: 'medschools-builder', scope: 'user' } as const;

export const route = apiRoute('/api/medschools/me/list-builder', {
  POST: implement(
    buildMedListApi,
    { rateLimit: BUILD_LIMIT, rateLimitExemptAdmin: true, body: buildListBody },
    async ({ userId, isAdmin, body, request }) => {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
      if (user?.bannedUntil && user.bannedUntil > new Date()) {
        return Response.json({ error: 'suspended' }, { status: 403 });
      }
      if (!isAiConfigured()) return Response.json({ ...refusalBody('AI_UNAVAILABLE') }, { status: 503 });
      return buildList({
        userId,
        isAdmin,
        request: body.request,
        useStats: body.useStats === true,
        think: body.think === true,
        signal: request.signal,
      });
    },
  ),
});

import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { modDecisionSchema } from '@/lib/communities/plus-schema';
import { requireMod } from '@/lib/communities/guard.server';
import { decideModItem } from '@/lib/communities/mod-decisions.server';

/**
 * POST /api/communities/$slug/modqueue/$itemId — approve or remove a queued item.
 * A removal may cite one of the community's rules (`ruleId`); the author's notice
 * then names it ("Removed from X for breaking rule 3: Title"). The decision and
 * its side effects are `decideModItem`, which the developer API calls too.
 */
export const route = apiRoute('/api/communities/$slug/modqueue/$itemId', {
  POST: defineHandler({ rateLimit: 'write', body: modDecisionSchema }, async ({ params, userId, body }) => {
    const guard = await requireMod(params.slug, userId);
    if (!guard.ok) return guard.response;
    const out = await decideModItem({
      community: guard.value,
      itemId: params.itemId,
      decision: body.decision,
      moderatorId: userId,
      ruleId: body.ruleId,
      message: body.message,
    });
    if (!out.ok) return Response.json({ error: out.error, ...refusalCodeOf(out) }, { status: out.status });
    return Response.json({ status: out.status });
  }),
});

import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { modDecisionSchema } from '@/lib/communities/plus-schema';
import { requireMod } from '@/lib/communities/guard.server';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { AutomodError, resolveModItem } from '@/lib/communities/automod.server';
import { getRule, recordCitation } from '@/lib/communities/rules.server';
import { removalNoticeText } from '@/lib/communities/rules';

/**
 * POST /api/communities/$slug/modqueue/$itemId — approve or remove a queued item.
 * A removal may cite one of the community's rules (`ruleId`); the author's notice
 * then names it ("Removed from X for breaking rule 3: Title").
 */
export const route = apiRoute('/api/communities/$slug/modqueue/$itemId', {
  POST: defineHandler(
    { rateLimit: 'write', body: modDecisionSchema },
    async ({ params, userId, body }) => {
      const guard = await requireMod(params.slug, userId);
      if (!guard.ok) return guard.response;
      const removing = body.decision === 'remove';
      // Check the cited rule belongs to this community before anything is resolved.
      const rule = removing && body.ruleId ? await getRule(guard.value.id, body.ruleId) : null;
      if (removing && body.ruleId && !rule) {
        return Response.json({ error: 'Rule not found' }, { status: 400 });
      }
      try {
        const result = await resolveModItem(
          guard.value.id,
          params.itemId,
          body.decision,
          userId,
          removing
            ? { rule: rule ? { id: rule.id, title: rule.title } : null, reason: body.message ?? null }
            : {},
        );
        if (removing && (body.message || rule)) {
          const item = await prisma.communityModItem.findUnique({
            where: { id: params.itemId },
            select: { authorId: true },
          });
          if (rule) await recordCitation(params.itemId, rule);
          if (item) {
            await createNotification({
              userId: item.authorId,
              type: 'SYSTEM',
              entityType: 'community',
              entityId: guard.value.id,
              preview: rule
                ? removalNoticeText({
                    communityName: guard.value.name,
                    rule,
                    message: body.message,
                  })
                : (body.message ?? null),
            });
          }
        }
        return Response.json(result);
      } catch (e) {
        if (e instanceof AutomodError) {
          return Response.json({ error: e.message }, { status: e.status });
        }
        throw e;
      }
    },
  ),
});

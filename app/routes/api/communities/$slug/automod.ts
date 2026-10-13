import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { automodRuleInputSchema } from '@/lib/communities/automod';
import { requireMod } from '@/lib/communities/guard.server';
import { AutomodError, createAutomodRule, getAutomodRules } from '@/lib/communities/automod.server';

/**
 * GET  /api/communities/$slug/automod — the community's AutoMod rules (mods).
 * POST /api/communities/$slug/automod — add a rule (cap 25).
 */
export const Route = createFileRoute('/api/communities/$slug/automod')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ params, userId }) => {
        const guard = await requireMod(params.slug, userId);
        if (!guard.ok) return guard.response;
        return Response.json({ rules: await getAutomodRules(guard.value.id) });
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: automodRuleInputSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            const rule = await createAutomodRule(guard.value.id, body);
            return Response.json({ rule }, { status: 201 });
          } catch (e) {
            if (e instanceof AutomodError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
    },
  },
});

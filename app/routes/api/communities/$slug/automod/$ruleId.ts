import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { automodRuleInputSchema } from '@/lib/communities/automod';
import { requireMod } from '@/lib/communities/guard.server';
import {
  AutomodError,
  deleteAutomodRule,
  updateAutomodRule,
} from '@/lib/communities/automod.server';

/** PATCH / DELETE /api/communities/$slug/automod/$ruleId — edit, toggle or remove a rule. */
export const Route = createFileRoute('/api/communities/$slug/automod/$ruleId')({
  server: {
    handlers: {
      PATCH: defineHandler(
        {
          rateLimit: 'write',
          body: automodRuleInputSchema.partial(),
          verboseValidationErrors: true,
        },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            await updateAutomodRule(guard.value.id, params.ruleId, body);
            return Response.json({ success: true });
          } catch (e) {
            if (e instanceof AutomodError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ params, userId }) => {
        const guard = await requireMod(params.slug, userId);
        if (!guard.ok) return guard.response;
        try {
          await deleteAutomodRule(guard.value.id, params.ruleId);
          return Response.json({ success: true });
        } catch (e) {
          if (e instanceof AutomodError) {
            return Response.json({ error: e.message }, { status: e.status });
          }
          throw e;
        }
      }),
    },
  },
});

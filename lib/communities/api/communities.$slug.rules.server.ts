import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireMod, requireReadable } from '@/lib/communities/guard.server';
import { getRulesApi, saveRulesApi } from '@/lib/communities/rules.contract';
import { saveRulesBody } from '@/lib/communities/rules-schema';
import { RulesError, getRequireAgreement, listRules, saveRules } from '@/lib/communities/rules.server';

/**
 * GET /api/communities/$slug/rules — the ordered rules (readable by anyone who can
 * read the community). PUT replaces the whole list and the agreement switch (mods).
 */
export const route = apiRoute('/api/communities/$slug/rules', {
  GET: implement(
    getRulesApi,
    {
      auth: 'optional',
      rateLimit: 'read',
    },
    async ({ params, userId }) => {
      const guard = await requireReadable(params.slug, userId);
      if (!guard.ok) return guard.response;
      const { id, slug, name } = guard.value;
      const [rules, requireAgreement] = await Promise.all([listRules(id), getRequireAgreement(id)]);
      return {
        community: {
          slug,
          name,
        },
        rules,
        requireAgreement,
      };
    },
  ),
  PUT: implement(
    saveRulesApi,
    {
      rateLimit: 'write',
      body: saveRulesBody,
      verboseValidationErrors: true,
    },
    async ({ params, userId, body }) => {
      const guard = await requireMod(params.slug, userId);
      if (!guard.ok) return guard.response;
      const { id, slug, name } = guard.value;
      try {
        await saveRules(id, body.rules, body.requireAgreement, userId);
      } catch (e) {
        if (e instanceof RulesError) {
          return Response.json(
            {
              error: e.message,
            },
            {
              status: e.status,
            },
          );
        }
        throw e;
      }
      const [rules, requireAgreement] = await Promise.all([listRules(id), getRequireAgreement(id)]);
      return {
        community: {
          slug,
          name,
        },
        rules,
        requireAgreement,
      };
    },
  ),
});

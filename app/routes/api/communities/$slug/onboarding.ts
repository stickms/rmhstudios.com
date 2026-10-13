import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { onboardingAnswerSchema, onboardingSetSchema } from '@/lib/communities/plus-schema';
import { requireMember, requireMod } from '@/lib/communities/guard.server';
import {
  OnboardingError,
  getOnboardingQuestions,
  setOnboardingQuestions,
  submitOnboardingAnswers,
} from '@/lib/communities/onboarding.server';

/**
 * GET  /api/communities/$slug/onboarding — the configured questions (mods, for the editor).
 * PUT  /api/communities/$slug/onboarding — mods replace the question set (≤ 5).
 * POST /api/communities/$slug/onboarding — a member submits their answers.
 */
export const Route = createFileRoute('/api/communities/$slug/onboarding')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ params, userId }) => {
        const guard = await requireMod(params.slug, userId);
        if (!guard.ok) return guard.response;
        return Response.json({ questions: await getOnboardingQuestions(guard.value.id) });
      }),
      PUT: defineHandler(
        { rateLimit: 'write', body: onboardingSetSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          return Response.json({ questions: await setOnboardingQuestions(guard.value.id, body) });
        },
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: onboardingAnswerSchema, verboseValidationErrors: true },
        async ({ params, userId, body }) => {
          const guard = await requireMember(params.slug, userId);
          if (!guard.ok) return guard.response;
          try {
            const result = await submitOnboardingAnswers(guard.value.id, userId, body.answers);
            return Response.json(result, { status: 201 });
          } catch (e) {
            if (e instanceof OnboardingError) {
              return Response.json({ error: e.message }, { status: e.status });
            }
            throw e;
          }
        },
      ),
    },
  },
});

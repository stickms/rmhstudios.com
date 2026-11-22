import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { decideSuggestionApi } from '@/lib/study/suggestions.contract';
import { decisionBody } from '@/lib/study/suggestions-schema';
import { decideSuggestion } from '@/lib/study/suggestions.server';
import { refusedResponse } from '@/lib/study/suggestion-refusal.server';

/**
 * POST /api/study/suggestions/$id/decision — the deck's author accepts (optionally with edits) or declines
 * (optionally with a reason, and optionally declining everything open from that member).
 */
export const route = apiRoute('/api/study/suggestions/$id/decision', {
  POST: implement(decideSuggestionApi, { rateLimit: 'write', body: decisionBody }, async ({ userId, params, body }) => {
    const result = await decideSuggestion(userId, params.id, body);
    if (!result.ok) return refusedResponse(result);
    return { success: true as const, status: result.status, declined: result.declined };
  }),
});

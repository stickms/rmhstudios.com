import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { withdrawSuggestionApi } from '@/lib/study/suggestions.contract';
import { withdrawSuggestion } from '@/lib/study/suggestions.server';
import { refusedResponse } from '@/lib/study/suggestion-refusal.server';

/** DELETE /api/study/suggestions/$id — the suggester withdraws their own open suggestion. */
export const route = apiRoute('/api/study/suggestions/$id', {
  DELETE: implement(withdrawSuggestionApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const result = await withdrawSuggestion(userId, params.id);
    if (!result.ok) return refusedResponse(result);
    return { success: true as const };
  }),
});

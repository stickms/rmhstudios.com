import { apiRoute } from '@/lib/api/route.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { implement } from '@/lib/api/implement.server';
import { createSuggestionApi, listSuggestionsApi } from '@/lib/study/suggestions.contract';
import { createSuggestionBody, listSuggestionsQuery } from '@/lib/study/suggestions-schema';
import { createSuggestion, listForAuthor, listMine } from '@/lib/study/suggestions.server';
import { MAX_SUGGESTIONS_PER_DAY } from '@/lib/study/suggestions';
import { refusedResponse } from '@/lib/study/suggestion-refusal.server';

/**
 * POST /api/study/decks/$id/suggestions — suggest a corrected front and back for one card (30 a day per member).
 * GET  /api/study/decks/$id/suggestions — `scope=author`: the deck author's open suggestions; `scope=mine`: your own.
 * Private to the suggester and the deck's author: nothing here is public.
 */
export const route = apiRoute('/api/study/decks/$id/suggestions', {
  POST: implement(
    createSuggestionApi,
    {
      rateLimit: { limit: MAX_SUGGESTIONS_PER_DAY, windowMs: 24 * 60 * 60 * 1000, prefix: 'deck-suggest' },
      body: createSuggestionBody,
    },
    async ({ userId, params, body }) => {
      const restricted = await restrictionResponse(userId, 'comment');
      if (restricted) return restricted;
      const result = await createSuggestion(userId, params.id, body);
      if (!result.ok) return refusedResponse(result);
      return { success: true as const, id: result.id };
    },
  ),

  GET: implement(
    listSuggestionsApi,
    { rateLimit: 'read', query: listSuggestionsQuery },
    async ({ userId, params, query }) => {
      if (query.scope === 'author') {
        const result = await listForAuthor(userId, params.id);
        if (!result.ok) return refusedResponse(result);
        return { author: result.suggestions, mine: [] };
      }
      return { author: [], mine: await listMine(userId, params.id) };
    },
  ),
});

/** Contracts for suggested corrections to a public deck (client-safe: types only, by `import type`). */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AuthorSuggestion, MySuggestion, SuggestionRefusal } from '@/lib/study/suggestions';
import type { createSuggestionBody, decisionBody, listSuggestionsQuery } from '@/lib/study/suggestions-schema';

/** A refusal's body: a stable `reason` the dialog turns into a sentence (never a caught error). */
export interface SuggestionRefused {
  error: string;
  reason: SuggestionRefusal;
}

/** Suggest a new front and back for one card of a deck that accepts suggestions. */
export const createSuggestionApi = endpoint<{
  body: z.infer<typeof createSuggestionBody>;
  res: { success: true; id: string };
}>()({
  method: 'POST',
  path: '/api/study/decks/$id/suggestions',
});

/** `scope=author`: the deck author's open suggestions, oldest first. `scope=mine`: the caller's own on this deck. */
export const listSuggestionsApi = endpoint<{
  query: z.infer<typeof listSuggestionsQuery>;
  res: { author: AuthorSuggestion[]; mine: MySuggestion[] };
}>()({
  method: 'GET',
  path: '/api/study/decks/$id/suggestions',
});

/** The deck author's decision on one open suggestion. */
export const decideSuggestionApi = endpoint<{
  body: z.infer<typeof decisionBody>;
  res: { success: true; status: 'accepted' | 'declined'; declined: number };
}>()({
  method: 'POST',
  path: '/api/study/suggestions/$id/decision',
});

/** The suggester takes back one of their own open suggestions. */
export const withdrawSuggestionApi = endpoint<{
  res: { success: true };
}>()({
  method: 'DELETE',
  path: '/api/study/suggestions/$id',
});

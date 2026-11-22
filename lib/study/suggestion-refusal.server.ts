import type { SuggestionRefusal } from '@/lib/study/suggestions';

/** Static, member-safe sentences for each refusal; the client shows its own translated text from `reason`. */
const MESSAGES: Record<SuggestionRefusal, string> = {
  'not-found': 'Not found',
  'own-deck': 'You cannot suggest to your own deck',
  blocked: 'You cannot suggest to this deck',
  banned: 'You cannot suggest right now',
  'too-new': 'Your account is too new to suggest',
  off: 'This deck does not take suggestions',
  'not-suggestable': 'This card cannot take a suggestion',
  invalid: 'Invalid suggestion',
  duplicate: 'This suggestion is already open',
  'no-change': 'This suggestion changes nothing',
  'member-cap': 'You have too many open suggestions on this deck',
  'deck-cap': 'This deck has too many open suggestions',
  'already-decided': 'This suggestion was already decided',
};

/** The JSON refusal of a suggestion endpoint: the status, a static `error` and the stable `reason`. */
export function refusedResponse(result: { status: number; reason: SuggestionRefusal }): Response {
  return Response.json({ error: MESSAGES[result.reason], reason: result.reason }, { status: result.status });
}

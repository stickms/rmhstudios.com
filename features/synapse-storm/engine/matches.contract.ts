/** Contract for Synapse Storm's "Your matches" read (sprint 14 03). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { MatchesPage } from './matches';

/**
 * The caller's own finished versus matches, newest first, 20 a page. The endpoint takes no user id and answers no
 * other player's id: the others are current names, "A player" or "Deleted user".
 */
export const getSynapseStormMatchesApi = endpoint<{
  query: {
    cursor?: string | undefined;
  };
  res: MatchesPage;
}>()({
  method: 'GET',
  path: '/api/games/synapse-storm/matches',
});

/** Contract for Synapse Storm's "Your matches" read (sprint 14 03). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { MatchesPage } from './matches';
import type { RivalsPage } from './rivals';

/**
 * The caller's own finished versus matches, newest first, 20 a page. The endpoint takes no user id and answers no
 * other player's id: the others are current names, "A player" or "Deleted user".
 */
export const getSynapseStormMatchesApi = endpoint<{
  query: {
    cursor?: string | undefined;
    /** A rival's `key` from the rivals read: only the matches the caller and that player both finished. */
    with?: string | undefined;
  };
  res: MatchesPage;
}>()({
  method: 'GET',
  path: '/api/games/synapse-storm/matches',
});

/**
 * The caller's record against each named account they finished versus matches with, most matches together first, at
 * most 50. No account id is answered: each rival carries a `key` that `with=` on the matches read resolves.
 */
export const getSynapseStormRivalsApi = endpoint<{
  res: RivalsPage;
}>()({
  method: 'GET',
  path: '/api/games/synapse-storm/rivals',
});

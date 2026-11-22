/** Contract for POST /api/games/$gameId/assist-run (client-safe). */
import { endpoint } from '@/lib/contract/endpoint';
import type { AssistProfile } from '@/lib/game/assist';

export const startAssistRunApi = endpoint<{
  res: {
    profile: AssistProfile;
  };
}>()({
  method: 'POST',
  path: '/api/games/$gameId/assist-run',
});

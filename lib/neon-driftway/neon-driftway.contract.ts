/** Contracts for Neon Driftway's leaderboard and livery (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

export interface NeonDriftwayRow {
  username: string;
  highScore: number;
}

export const neonDriftwayLeaderboardApi =
  endpoint<{
    res: NeonDriftwayRow[];
  }>()(
    {
      method:
        'GET',
      path: '/api/neon-driftway/leaderboard',
    },
  );

/** The saved livery code, or null. */
export const getLiveryApi =
  endpoint<{
    res: {
      code:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/neon-driftway/livery',
    },
  );

export const saveLiveryApi =
  endpoint<{
    body: {
      code: string;
    };
    res: {
      code: string;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/neon-driftway/livery',
    },
  );

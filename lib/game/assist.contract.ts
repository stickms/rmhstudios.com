/**
 * Contracts for /api/settings/game-assists (redesign audit C1, batch 5).
 * Client-safe: request types come from the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AssistSettings } from '@/lib/game/assist';
import type { assistPatchSchema } from '@/lib/game/assist-schema';

export interface AssistView {
  assists: AssistSettings;
  /** Games that currently honour the assists. */
  honouredBy: string[];
}

export const getAssistsApi =
  endpoint<{
    res: AssistView;
  }>()(
    {
      method:
        'GET',
      path: '/api/settings/game-assists',
    },
  );

export const setAssistsApi =
  endpoint<{
    body: z.infer<
      typeof assistPatchSchema
    >;
    res: AssistView;
  }>()(
    {
      method:
        'POST',
      path: '/api/settings/game-assists',
    },
  );

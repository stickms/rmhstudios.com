/**
 * Contracts for saving replays and racing ghosts (redesign audit C1, batch 10).
 * A refusal is `{ error }` with its status (400 / 403 / 413 / 422). Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  getGhostQuery,
  saveGhostBody,
  submitReplayBody,
} from './replay-schema';
import type { GhostView } from '@/lib/replays.server';

/** Store a replay; the server re-simulates it and keeps the derived score. */
export const submitReplayApi =
  endpoint<{
    body: z.infer<
      typeof submitReplayBody
    >;
    res: {
      id: string;
      score:
        | number
        | null;
      url: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/replays',
    },
  );

/** The trace to race (`ghost: null` when there is none). */
export const getGhostApi =
  endpoint<{
    query: z.infer<
      typeof getGhostQuery
    >;
    res: {
      ghost: GhostView | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/replays/ghost',
    },
  );

/** Store the caller's ghost for a level (on a new best). */
export const saveGhostApi =
  endpoint<{
    body: z.infer<
      typeof saveGhostBody
    >;
    res: {
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/replays/ghost',
    },
  );

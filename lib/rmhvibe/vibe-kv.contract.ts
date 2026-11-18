/** Contracts for the per-page vibe key-value store. Client-safe: no zod ships from here. */
import { endpoint } from '@/lib/contract/endpoint';
import type { z } from 'zod';
import type {
  vibeKvReadQuerySchema,
  vibeKvWriteBodySchema,
} from '@/lib/rmhvibe/vibe-kv-schema';

/**
 * Read one key (`key`) or list a prefix (`prefix`, one of the two). `scope: 'user'`
 * needs a session (401); the page must be ready (404).
 */
export const vibeKvReadApi =
  endpoint<{
    query: z.infer<
      typeof vibeKvReadQuerySchema
    >;
    res:
      | {
          value: unknown;
        }
      | {
          items: Array<{
            key: string;
            value: unknown;
          }>;
        };
  }>()(
    {
      method:
        'GET',
      path: '/api/vibe/kv/$slug',
    },
  );

/**
 * `set` stores a JSON value (≤ 4096 chars); `incr` adds an integer in [-1000, 1000] to a
 * number atomically, and with `oncePerUser` counts at most once per signed-in user.
 */
export const vibeKvWriteApi =
  endpoint<{
    body: z.infer<
      typeof vibeKvWriteBodySchema
    >;
    res:
      | {
          ok: true;
        }
      | {
          value: number;
          counted: boolean;
        };
  }>()(
    {
      method:
        'POST',
      path: '/api/vibe/kv/$slug',
    },
  );

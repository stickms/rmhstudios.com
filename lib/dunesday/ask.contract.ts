/**
 * Contract for the Dunesday Buddy assistant (redesign audit C1, batch 10). Callers pass
 * `timeoutMs: AI_TIMEOUT_MS`. 429 when asked too fast, 503 / 502 with a sentence the user can
 * act on. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { DunesdayAsk } from '@/lib/dunesday/ask-schema';

export const askDunesdayApi =
  endpoint<{
    body: DunesdayAsk;
    res: {
      answer: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/dunesday/ask',
    },
  );

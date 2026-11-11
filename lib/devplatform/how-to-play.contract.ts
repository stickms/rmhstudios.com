/**
 * Contract for the "How do I play?" answer (redesign audit C1, batch 10). Callers pass
 * `timeoutMs: AI_TIMEOUT_MS`. 503 when AI is off, 502 when it has no answer. Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { howToPlaySchema } from '@/lib/devplatform/how-to-play-schema';

export const howToPlayApi = endpoint<{
  body: z.infer<typeof howToPlaySchema>;
  res: { answer: string };
}>()({ method: 'POST', path: '/api/games/how-to-play' });

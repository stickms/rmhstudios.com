/**
 * Contract for the PF2e calendar assistant (redesign audit C1, batch 10). Model calls are slow,
 * so callers pass `timeoutMs: AI_TIMEOUT_MS`. 503 when the assistant is off, 502 with a sentence
 * the user can act on when the upstream fails or has no answer. Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { pf2ecalAskSchema } from '@/lib/pf2ecal/ask-schema';

export const askPf2ecalApi = endpoint<{
  body: z.infer<typeof pf2ecalAskSchema>;
  res: { answer: string };
}>()({ method: 'POST', path: '/api/pf2ecal/ask' });

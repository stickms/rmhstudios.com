/**
 * Contract for the site concierge (redesign audit C1, batch 10). Callers pass
 * `timeoutMs: AI_TIMEOUT_MS`. A spent daily quota still answers 200 with `quotaExceeded`;
 * 429 `Slow down a moment` is the rate limit. Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { assistantAskSchema } from '@/lib/assistant/assistant-schema';
import type { AssistantAnswer } from '@/lib/assistant/assistant.server';

export const askConciergeApi = endpoint<{
  body: z.infer<typeof assistantAskSchema>;
  res: AssistantAnswer;
}>()({ method: 'POST', path: '/api/assistant' });

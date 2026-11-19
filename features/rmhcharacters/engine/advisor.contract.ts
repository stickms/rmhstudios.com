/**
 * The advisor endpoint (RMHCharacters). Client-safe: types only from the zod schema.
 * Callers pass `timeoutMs: AI_TIMEOUT_MS`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { advisorBody } from './advisor-schema';

export const askAdvisorApi = endpoint<{
  body: z.infer<typeof advisorBody>;
  res: { answer: string };
}>()({ method: 'POST', path: '/api/rmhcharacters/advisor' });

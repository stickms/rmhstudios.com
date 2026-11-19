/**
 * The advisor endpoint (RMHCharacters): any question about (or beyond) one character, answered with
 * Markdown plus structured recommendations the UI can look up and add. Client-safe: types only.
 * Callers pass `timeoutMs: AI_TIMEOUT_MS`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { advisorBody, advisorResponse } from './advisor-schema';

export const askAdvisorApi = endpoint<{
  body: z.infer<typeof advisorBody>;
  res: z.infer<typeof advisorResponse>;
}>()({ method: 'POST', path: '/api/rmhcharacters/advisor' });

export type AdvisorReply = z.infer<typeof advisorResponse>;
export type Recommendation = AdvisorReply['recommendations'][number];

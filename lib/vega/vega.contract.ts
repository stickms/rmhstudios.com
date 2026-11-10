/** Contract for the Vega score submit (redesign audit C1, batch 10). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { vegaScoreBody } from './score-schema';

/** The caller's profile row comes back opaque; the client only needs the submit to land. */
export const submitVegaScoreApi = endpoint<{
  body: z.infer<typeof vegaScoreBody>;
  res: { success: true; profile: Record<string, unknown>; isRecord: boolean };
}>()({ method: 'POST', path: '/api/vega/score' });

/**
 * Contracts for reading experiment assignments (batch 7) and recording an exposure
 * or a conversion (batch 9, sent with `keepalive`). Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { experimentEventSchema } from '@/lib/ops/schema';

export const getExperimentAssignmentsApi = endpoint<{
  res: { assignments: Record<string, 'control' | 'test'> };
}>()({ method: 'GET', path: '/api/experiments' });

/** Record an exposure or a conversion. The server keeps the first of each. */
export const recordExperimentEventApi = endpoint<{
  body: z.infer<typeof experimentEventSchema>;
  res: { ok: true };
}>()({ method: 'POST', path: '/api/experiments' });

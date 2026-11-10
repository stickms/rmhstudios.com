/**
 * Contract for reading experiment assignments (redesign audit C1, batch 7).
 * Client-safe. The exposure/convert POST stays a raw keepalive beacon.
 */
import { endpoint } from '@/lib/contract/endpoint';

export const getExperimentAssignmentsApi = endpoint<{
  res: { assignments: Record<string, 'control' | 'test'> };
}>()({ method: 'GET', path: '/api/experiments' });

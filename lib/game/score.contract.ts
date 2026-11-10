/**
 * Contracts for per-game score routes that answer through the shared score
 * pipeline (redesign audit C1, batch 9). A refusal is `{ error, reason }` with
 * the pipeline's status; read `reason` with `errorField(e, 'reason')`. Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { neonDriftwayScoreBody } from './score-schema';
import type { synapseStormScoreBody } from '@features/synapse-storm/engine/score-schema';

/** Opaque result-moment payload; parse it with `parseScoreMoment`. */
export type ScoreMoment = unknown;

export const submitNeonDriftwayScoreApi = endpoint<{
  body: z.infer<typeof neonDriftwayScoreBody>;
  res: { success: true; linked: true; moment: ScoreMoment };
}>()({ method: 'POST', path: '/api/neon-driftway/score' });

export const submitSynapseStormScoreApi = endpoint<{
  body: z.infer<typeof synapseStormScoreBody>;
  res: { success: true; moment: ScoreMoment };
}>()({ method: 'POST', path: '/api/games/synapse-storm/score' });

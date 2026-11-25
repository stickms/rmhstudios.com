/**
 * RMHbox — Sequence Sam host settings and tuning constants.
 */

import type { GameSettingsSchema } from '../types';

export const SS_DEFAULT_ROUNDS = 8;
export const SS_DEFAULT_RECALL_SECONDS = 20;
export const SS_DEFAULT_STEP_MS = 600;
/** The slower show: the same pads, a step every 900 ms. */
export const SS_SLOW_STEP_MS = 900;
/** The pause before the first step of a round, so every screen is ready. */
export const SS_SHOW_LEAD_MS = 1500;
/** How long a round's result stays on screen. */
export const SS_RESULT_SECONDS = 6;

export const SEQUENCE_SAM_SETTINGS: GameSettingsSchema = [
  {
    key: 'rounds',
    type: 'integer',
    label: 'Number of Rounds',
    description: 'Each round adds one step to the sequence',
    default: SS_DEFAULT_ROUNDS,
    min: 5,
    max: 12,
    step: 1,
  },
  {
    key: 'recallSeconds',
    type: 'integer',
    label: 'Seconds to Play Back',
    description: 'Time to tap the sequence once it has been shown',
    default: SS_DEFAULT_RECALL_SECONDS,
    min: 10,
    max: 40,
    step: 5,
  },
  {
    key: 'stepMs',
    type: 'integer',
    label: 'Step Length (ms)',
    description: '600 is the normal show; 900 is a slower show for everyone',
    default: SS_DEFAULT_STEP_MS,
    min: SS_DEFAULT_STEP_MS,
    max: SS_SLOW_STEP_MS,
    step: SS_SLOW_STEP_MS - SS_DEFAULT_STEP_MS,
  },
];

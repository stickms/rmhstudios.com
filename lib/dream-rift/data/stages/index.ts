/**
 * Barrel export for all stage definitions.
 */

import type { StageDef } from '../../types';

export { STAGE_1 } from './stage1';
export { STAGE_2 } from './stage2';
export { STAGE_3 } from './stage3';
export { STAGE_4 } from './stage4';
export { STAGE_5 } from './stage5';
export { STAGE_6 } from './stage6';

// Re-import for the lookup map
import { STAGE_1 } from './stage1';
import { STAGE_2 } from './stage2';
import { STAGE_3 } from './stage3';
import { STAGE_4 } from './stage4';
import { STAGE_5 } from './stage5';
import { STAGE_6 } from './stage6';

/** All stages indexed by stage number (1-based). */
export const STAGES: Record<number, StageDef> = {
  1: STAGE_1,
  2: STAGE_2,
  3: STAGE_3,
  4: STAGE_4,
  5: STAGE_5,
  6: STAGE_6,
};

/** Total number of stages in the game. */
export const STAGE_COUNT = 6;

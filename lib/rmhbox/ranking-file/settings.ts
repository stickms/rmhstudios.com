/**
 * RMHbox — Ranking File host settings and tuning constants.
 */

import type { GameSettingsSchema } from '../types';

export const RF_TOTAL_ROUNDS = 5;
export const RF_ROUND_SECONDS = 45;
/** How long the official order stays on screen after a round. */
export const RF_REVEAL_SECONDS = 8;

export const RANKING_FILE_SETTINGS: GameSettingsSchema = [
  {
    key: 'totalRounds',
    type: 'integer',
    label: 'Number of Rounds',
    description: 'How many sets to put in order',
    default: RF_TOTAL_ROUNDS,
    min: 3,
    max: 8,
    step: 1,
  },
  {
    key: 'roundSeconds',
    type: 'integer',
    label: 'Seconds per Round',
    description: 'Time to order the five items and lock in',
    default: RF_ROUND_SECONDS,
    min: 20,
    max: 90,
    step: 5,
  },
  {
    key: 'category',
    type: 'select',
    label: 'Category',
    description: 'Which kind of sets to draw from',
    default: 'all',
    options: ['all', 'science', 'geography', 'history', 'culture'],
  },
];

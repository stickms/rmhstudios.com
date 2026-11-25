/**
 * RMHbox — Identity Crisis host settings and tuning constants.
 */

import type { GameSettingsSchema } from '../types';

export const IC_DEFAULT_QUESTIONS_PER_PLAYER = 3;
export const IC_MIN_QUESTIONS_PER_PLAYER = 2;
export const IC_MAX_QUESTIONS_PER_PLAYER = 5;

export const IC_DEFAULT_ASK_SECONDS = 20;
export const IC_MIN_ASK_SECONDS = 10;
export const IC_MAX_ASK_SECONDS = 40;

/** Seconds the table has to vote on a question. */
export const IC_VOTE_SECONDS = 15;
/** Seconds the vote result stays on screen. */
export const IC_RESULT_SECONDS = 4;
/** Seconds everyone studies the board before the first turn. */
export const IC_ASSIGN_SECONDS = 6;
/** Seconds everyone not yet right has for the final guess. */
export const IC_FINAL_SECONDS = 30;
/** Seconds the reveal stays on screen before the match ends. */
export const IC_REVEAL_SECONDS = 10;

/** Points. */
export const IC_CORRECT_GUESS = 200;
export const IC_EARLY_BONUS_BASE = 300;
export const IC_EARLY_PENALTY = -100;
export const IC_EFFICIENCY_BONUS = 20;

/** fuse.js threshold for matching a guess against a name or alias (lower is stricter). */
export const IC_GUESS_MATCH_THRESHOLD = 0.3;

export const IC_MIN_QUESTION_LENGTH = 3;
export const IC_MAX_QUESTION_LENGTH = 200;
export const IC_MIN_GUESS_LENGTH = 1;
export const IC_MAX_GUESS_LENGTH = 100;

export const IDENTITY_CRISIS_SETTINGS: GameSettingsSchema = [
  {
    key: 'questionsPerPlayer',
    type: 'integer',
    label: 'Questions Per Player',
    description: 'How many yes-or-no questions each player may ask about themselves',
    default: IC_DEFAULT_QUESTIONS_PER_PLAYER,
    min: IC_MIN_QUESTIONS_PER_PLAYER,
    max: IC_MAX_QUESTIONS_PER_PLAYER,
    step: 1,
  },
  {
    key: 'askSeconds',
    type: 'integer',
    label: 'Seconds to Ask',
    description: 'Time the asker has to type a question',
    default: IC_DEFAULT_ASK_SECONDS,
    min: IC_MIN_ASK_SECONDS,
    max: IC_MAX_ASK_SECONDS,
    step: 5,
  },
  {
    key: 'hardIdentities',
    type: 'boolean',
    label: 'Hard Identities',
    description: 'Include lesser-known people and characters',
    default: false,
  },
];

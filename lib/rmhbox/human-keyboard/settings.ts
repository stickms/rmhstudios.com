/**
 * RMHbox — Human Keyboard host settings and tuning constants.
 */

import type { GameSettingsSchema } from '../types';

export const HK_DEFAULT_ROUNDS = 2;
export const HK_MIN_ROUNDS = 1;
export const HK_MAX_ROUNDS = 3;

export const HK_DEFAULT_RESHUFFLE_SECONDS = 8;
export const HK_MIN_RESHUFFLE_SECONDS = 6;
export const HK_MAX_RESHUFFLE_SECONDS = 15;

/** Seconds the sentence is shown before anyone may type. */
export const HK_REVEAL_SECONDS = 3;
/** The most time a round's typing phase can take. */
export const HK_TYPING_SECONDS = 90;
/** How long a round's result stays on screen. */
export const HK_RESULT_SECONDS = 5;
/** Seconds of warning before the keys are reshuffled. */
export const HK_RESHUFFLE_WARNING_SECONDS = 3;

/** The sentence is locked for everyone this long after a wrong held letter. */
export const HK_WRONG_KEY_LOCK_MS = 500;
/** A space in the sentence advances on its own after this long. */
export const HK_SPACE_DELAY_MS = 200;
/** Most key presses one player can make in HK_RATE_WINDOW_MS; the rest are dropped. */
export const HK_INPUT_RATE_LIMIT = 5;
export const HK_RATE_WINDOW_MS = 1000;
/** A disconnected player's letters go to the others after this long. */
export const HK_REDEAL_GRACE_MS = 5000;

/** Points. */
export const HK_CORRECT_KEY = 20;
export const HK_PERFECT_ACCURACY_BONUS = 200;
export const HK_COMPLETION_BONUS = 100;
export const HK_TIME_BONUS_PER_SECOND = 5;
export const HK_MVP_BONUS = 100;
export const HK_WRONG_KEY_PENALTY = 5;

/** The team multiplier: finished within this share of the typing time, or not at all. */
export const HK_OUTSTANDING_SHARE = 0.5;
export const HK_OUTSTANDING_MULTIPLIER = 1.5;
export const HK_GOOD_MULTIPLIER = 1;
export const HK_INCOMPLETE_MULTIPLIER = 0.5;

export const HUMAN_KEYBOARD_SETTINGS: GameSettingsSchema = [
  {
    key: 'rounds',
    type: 'integer',
    label: 'Number of Rounds',
    description: 'One sentence per round, with a fresh deal of the letters each round',
    default: HK_DEFAULT_ROUNDS,
    min: HK_MIN_ROUNDS,
    max: HK_MAX_ROUNDS,
    step: 1,
  },
  {
    key: 'reshuffleSeconds',
    type: 'integer',
    label: 'Seconds Between Reshuffles',
    description: 'How often the letters are dealt out again',
    default: HK_DEFAULT_RESHUFFLE_SECONDS,
    min: HK_MIN_RESHUFFLE_SECONDS,
    max: HK_MAX_RESHUFFLE_SECONDS,
    step: 1,
  },
  {
    key: 'packCode',
    type: 'text',
    label: 'Custom Pack',
    description: 'Optional 6-character community pack code (leave empty for the built-in sentences)',
    default: '',
    maxLength: 6,
  },
];

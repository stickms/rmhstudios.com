/**
 * The built-in prompt rotation (X4). Used only for days with no admin-curated
 * prompt, so the card never goes dark. Order is stable — the prompt for a day is
 * a pure function of the date, which is what lets the archive show past fallback
 * days without storing anything.
 */

import { isValidDayKey } from './constants';

export const BUILTIN_QOTD_PROMPTS: readonly string[] = [
  'What is something small that made you smile this week?',
  'What is the best thing you played, watched or read recently?',
  'Which game would you recommend to someone who has never played anything?',
  'What is a skill you wish you had learned earlier?',
  'What song has been stuck in your head lately?',
  'Describe your perfect lazy Sunday in one sentence.',
  'What is a hill you will happily die on?',
  'What is the most useful thing you learned this month?',
  'If you could add one feature to this site, what would it be?',
  'What is your all-time favourite video game soundtrack?',
  'What is the last thing you made with your own hands?',
  'Which fictional world would you most like to live in?',
  'What is one thing you are looking forward to?',
  'What is the best advice you have ever been given?',
  'What does your desk or setup look like right now?',
  'What is a game mechanic you wish more games used?',
  'What is a tiny habit that improved your life?',
  'What is the most underrated thing you know about?',
  'Which book, show or game changed how you think?',
  'What would you do with an extra hour every day?',
  'What is your comfort meal?',
  'What is a project you keep meaning to start?',
  'What is the best thing a stranger has ever done for you?',
  'Which decade had the best music, and why?',
  'What is something you are proud of that nobody noticed?',
  'What is a skill you are currently learning?',
  'If you could master any instrument overnight, which one?',
  'What is the weirdest fact you know?',
  'What is the best game you finished in a single sitting?',
  'What is one thing you would tell your younger self?',
];

/** Whole days since 1970-01-01 for a YYYY-MM-DD key (UTC). */
export function dayNumber(dayKey: string): number {
  return Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86_400_000);
}

/** The built-in prompt for a day. Pure and total: bad keys fall back to day 0. */
export function builtinPromptFor(dayKey: string): string {
  const n = isValidDayKey(dayKey) ? dayNumber(dayKey) : 0;
  const len = BUILTIN_QOTD_PROMPTS.length;
  return BUILTIN_QOTD_PROMPTS[((n % len) + len) % len];
}

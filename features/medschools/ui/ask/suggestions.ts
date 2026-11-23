/**
 * The starter questions under the field. Five on the Ask page, three on a school's panel (where the school is pinned,
 * so a question needs no name). A suggestion fills the field and never submits. `key` and `defaultValue` are literal
 * so `pnpm i18n:extract` finds them: the list is read through `t(key, { defaultValue })` in `AskForm`.
 */
export interface Suggestion {
  key: string;
  defaultValue: string;
  /** True when the question is about one school and reads without a name (a pinned panel). */
  school: boolean;
}

export const SUGGESTIONS: readonly Suggestion[] = [
  {
    key: 'ask-suggest-interviews',
    defaultValue: 'How many interviews has this school reported this cycle?',
    school: true,
  },
  { key: 'ask-suggest-stats', defaultValue: 'What are the MCAT and GPA medians?', school: true },
  { key: 'ask-suggest-timing', defaultValue: 'When do interview invitations usually go out?', school: true },
  { key: 'ask-suggest-compare', defaultValue: 'Compare reported interviews at Duke and Emory.', school: false },
  { key: 'ask-suggest-format', defaultValue: 'Which Texas schools use MMI interviews?', school: false },
];

/** What a pinned panel offers: the questions that read without a school name. */
export function suggestionsFor(pinned: boolean): readonly Suggestion[] {
  return pinned ? SUGGESTIONS.filter((s) => s.school) : SUGGESTIONS;
}

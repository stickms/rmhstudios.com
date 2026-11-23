/**
 * The starter questions under the field. Five on the Ask page, each naming a school or a state; three on a school's panel (where the school is pinned,
 * so a question needs no name). A suggestion fills the field and never submits. The wording lives in `AskForm`'s switch
 * (literal `t()` calls, so `pnpm i18n:extract` finds each key); this list holds the keys and which panel shows them.
 */
export interface Suggestion {
  key: string;
  /** True when the question is about one school and reads without a name (a pinned panel). */
  school: boolean;
}

export const SUGGESTIONS: readonly Suggestion[] = [
  // A school's panel: the school is pinned, so the questions say "this school".
  {
    key: 'ask-suggest-interviews',
    school: true,
  },
  { key: 'ask-suggest-stats', school: true },
  { key: 'ask-suggest-timing', school: true },
  // The Ask page: no school is pinned, so each question names one (or a state).
  {
    key: 'ask-suggest-page-interviews',
    school: false,
  },
  { key: 'ask-suggest-page-stats', school: false },
  {
    key: 'ask-suggest-page-timing',
    school: false,
  },
  { key: 'ask-suggest-compare', school: false },
  { key: 'ask-suggest-format', school: false },
];

/** What a pinned panel offers: the questions that read without a school name. */
export function suggestionsFor(pinned: boolean): readonly Suggestion[] {
  return SUGGESTIONS.filter((s) => s.school === pinned);
}

import { THEME_IDS, type ThemeId } from './theme-ids';

/**
 * Keyword theme rules (ruling R1: rules, not a model). One ordered table, case-insensitive on the lower-cased prompt. A
 * rule change is one edit here plus a `THEMES_VERSION` bump, which makes the job re-tag older rows. Multi-label: a prompt
 * can match several rules; `other` only when none matches.
 */
export const THEMES_VERSION = 1;

const RULES: readonly { id: Exclude<ThemeId, 'other'>; re: RegExp }[] = [
  {
    id: 'why-school',
    re: /\b(?:(?:our|this) (?:school|institution|university|college|program|mission)|why (?:us|here|this school)|interested in (?:us|our|this)|(?:attend|apply to) (?:our|this)|(?:our|your) mission|fit (?:with|for)|why (?:are|do) you (?:applying|apply) (?:to|here))\b/,
  },
  {
    id: 'why-medicine',
    re: /\b(?:physicians?|medicine|become a (?:doctor|physician)|be a (?:doctor|physician)|career in medicine|calling)\b/,
  },
  {
    id: 'diversity',
    re: /\b(?:divers\w*|underrepresented|under-represented|lived experiences?|inclusi\w*|different perspectives?)\b/,
  },
  {
    id: 'adversity',
    re: /\b(?:advers\w*|hardships?|disadvantag\w*|obstacles?|overcame|overcome|struggl\w*|barriers?)\b/,
  },
  {
    id: 'challenge',
    re: /\b(?:challeng\w*|conflicts?|failures?|failed|mistakes?|ethical dilemmas?|dilemmas?|setbacks?)\b/,
  },
  {
    id: 'gap-year',
    re: /\b(?:gap years?|time off|since graduat\w*|activities since|time since|years since|post-?bacc\w*)\b/,
  },
  {
    id: 'service',
    re: /\b(?:service|volunteer\w*|underserved|communit(?:y|ies))\b/,
  },
  {
    id: 'research',
    re: /\b(?:research\w*|scholarly|scholarship|physician[- ]scientists?|publications?)\b/,
  },
  {
    id: 'leadership',
    re: /\b(?:leaders?|leadership|team\w*|supervis\w*)\b/,
  },
  {
    id: 'growth',
    re: /\b(?:growth|meaningful|reflect\w*|learn(?:ed|t)?|grew|personal development|affected you|shaped you)\b/,
  },
  {
    id: 'additional-info',
    re: /\b(?:anything else|additional information|further information|extenuating|circumstances|covid\w*|irregularit\w*|explain any)\b/,
  },
  {
    id: 'future-goals',
    re: /\b(?:future|ten years|10 years|five years|career goals?|goals?|see yourself)\b/,
  },
];

/** The themes of one prompt, in `THEME_IDS` order; `['other']` only when nothing else matches. */
export function tagThemes(text: string): ThemeId[] {
  const t = text.toLowerCase().replace(/[‘’]/g, "'");
  const hit = new Set<ThemeId>();
  for (const { id, re } of RULES) if (re.test(t)) hit.add(id);
  if (hit.size === 0) return ['other'];
  return THEME_IDS.filter((id) => hit.has(id));
}

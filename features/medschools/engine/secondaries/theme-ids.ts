/**
 * The fixed theme list a prompt is tagged with (client-safe: the UI imports it for labels and ordering). The order is the
 * display order; `other` is the first-class bucket for a prompt no rule matches.
 */
export const THEME_IDS = [
  'why-school',
  'why-medicine',
  'diversity',
  'adversity',
  'challenge',
  'gap-year',
  'service',
  'research',
  'leadership',
  'growth',
  'additional-info',
  'future-goals',
  'other',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

const THEME_SET: ReadonlySet<string> = new Set(THEME_IDS);

/** Narrows a stored string (the column is a plain `String[]`) to a theme the UI has a label for. */
export function isThemeId(value: string): value is ThemeId {
  return THEME_SET.has(value);
}

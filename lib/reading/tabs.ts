/** Tabs on /reading — kept in a tiny module so the route file imports no component code. */
export const READING_TABS = ['highlights', 'shelves', 'challenge'] as const;
export type ReadingTab = (typeof READING_TABS)[number];

export function parseReadingTab(value: unknown): ReadingTab {
  return READING_TABS.find((t) => t === value) ?? 'highlights';
}

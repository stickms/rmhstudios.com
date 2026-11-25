/**
 * The stories index (s13-12) — the pure half, client-safe. A story is listed when it has at least one published
 * article, by its newest published article's date, then by title. The database side is `stories.server.ts`.
 */

/** Stories per page of `/news/stories`. */
export const STORIES_PAGE_SIZE = 30;

export interface StoryIndexRow {
  slug: string;
  title: string;
  summary: string;
  /** Published articles in the story. */
  count: number;
  /** The newest published article's date (`YYYY-MM-DD`). */
  latest: string;
}

export interface StoryArticleStamp {
  storyId: string;
  status: string;
  date: string;
}

export interface StoryAggregate {
  storyId: string;
  count: number;
  latest: string;
}

/** Fold the (story, article) pairs into one row per story: published articles only; a story with none is dropped. */
export function aggregatePublished(rows: readonly StoryArticleStamp[]): StoryAggregate[] {
  const byStory = new Map<string, StoryAggregate>();
  for (const r of rows) {
    if (r.status !== 'PUBLISHED') continue;
    const cur = byStory.get(r.storyId);
    if (!cur) byStory.set(r.storyId, { storyId: r.storyId, count: 1, latest: r.date });
    else {
      cur.count += 1;
      if (r.date > cur.latest) cur.latest = r.date;
    }
  }
  return [...byStory.values()];
}

/** Newest activity first; equal dates fall back to the slug, so a page never reshuffles and a cursor is exact. */
export function compareStories(a: StoryIndexRow, b: StoryIndexRow): number {
  return b.latest.localeCompare(a.latest) || a.slug.localeCompare(b.slug);
}

export function sortStories(rows: readonly StoryIndexRow[]): StoryIndexRow[] {
  return [...rows].sort(compareStories);
}

/** The cursor is the last row's `latest|slug`; the next page is every row strictly after it in sort order. */
export function encodeStoryCursor(row: Pick<StoryIndexRow, 'latest' | 'slug'>): string {
  return `${row.latest}|${row.slug}`;
}

export function decodeStoryCursor(cursor: string | null | undefined): { latest: string; slug: string } | null {
  if (!cursor) return null;
  const m = /^(\d{4}-\d{2}-\d{2})\|([A-Za-z0-9._-]{1,200})$/.exec(cursor);
  return m ? { latest: m[1]!, slug: m[2]! } : null;
}

/** One page of an already-sorted list, after `cursor`. */
export function pageStories(
  sorted: readonly StoryIndexRow[],
  cursor: string | null | undefined,
  size: number = STORIES_PAGE_SIZE,
): { stories: StoryIndexRow[]; nextCursor: string | null } {
  const at = decodeStoryCursor(cursor);
  const rest = at ? sorted.filter((r) => compareAfter(r, at) > 0) : sorted;
  const stories = rest.slice(0, size);
  return {
    stories,
    nextCursor: rest.length > size && stories.length > 0 ? encodeStoryCursor(stories[stories.length - 1]!) : null,
  };
}

function compareAfter(row: StoryIndexRow, at: { latest: string; slug: string }): number {
  // Positive when `row` sorts after the cursor row in `compareStories` order.
  return at.latest.localeCompare(row.latest) || row.slug.localeCompare(at.slug);
}

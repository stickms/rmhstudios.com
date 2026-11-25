/** Lists you are on (s13-11): client-safe shapes and the page size. */

export const LISTS_ON_PAGE = 50;

export interface ListOnRow {
  id: string;
  name: string;
  owner: { name: string | null; handle: string | null };
  /** ISO date the member was added. */
  addedAt: string;
}

export interface ListsOnPage {
  lists: ListOnRow[];
  nextCursor: string | null;
}

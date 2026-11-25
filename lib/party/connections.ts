export type { CreateGridInput } from './connections-schema';

export const MAX_MISTAKES = 4;
export const MAX_GRIDS_PER_MEMBER = 20;
/** Ratings only count once a grid has this many (so one 5-star can't top the list). */
export const MIN_RATINGS_FOR_RANK = 3;
/** A grid's own average rating is shown to its author once it has this many ratings. */
export const MIN_RATINGS_FOR_AVERAGE = 3;

export interface GridGroup {
  label: string;
  items: string[];
}

export interface GridSummary {
  id: string;
  title: string;
  author: {
    name: string | null;
    handle: string | null;
  } | null;
  plays: number;
  solveRate: number | null;
  rating: number | null;
  ratingCount: number;
  dailyDate: string | null;
}

/** One of the author's own grids on /connections/mine (drafts included). */
export interface MyGridSummary {
  id: string;
  title: string;
  draft: boolean;
  publishedAt: string | null;
  playCount: number;
  solveCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  dailyDate: string | null;
  hidden: boolean;
}

export interface GridPlayView extends GridSummary {
  /** The 16 items, in a stable shuffled order. */
  items: string[];
  isAuthor: boolean;
  /** Only the author sees a draft. */
  draft: boolean;
  /** The author may still change it: it is a draft, or no other member has played it. */
  editable: boolean;
  found: {
    index: number;
    label: string;
    items: string[];
  }[];
  mistakes: number;
  status: 'active' | 'solved' | 'failed';
  myRating: number | null;
  /** Revealed once the play is finished (or to the author). */
  solution: GridGroup[] | null;
}

/** Order used to rank "top rated": average rating, then solve rate. */
export function gridScore(g: Pick<GridSummary, 'rating' | 'ratingCount' | 'solveRate'>): number {
  if (g.rating == null || g.ratingCount < MIN_RATINGS_FOR_RANK) return -1;
  return g.rating * 10 + (g.solveRate ?? 0);
}

/** Emoji result for sharing: one row per guess is not stored, so rows are the groups found. */
export function shareText(title: string, view: Pick<GridPlayView, 'found' | 'mistakes' | 'status'>, url: string) {
  const sq = ['🟨', '🟩', '🟦', '🟪'];
  const rows = view.found.map((f) => sq[f.index % 4].repeat(4)).join('\n');
  const miss = '❌'.repeat(view.mistakes);
  return `RMHConnections "${title}" ${view.status === 'solved' ? '✅' : '💀'}\n${rows}${miss ? `\n${miss}` : ''}\n${url}`;
}

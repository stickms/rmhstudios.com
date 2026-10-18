import { z } from 'zod';

export const MAX_MISTAKES = 4;
export const MAX_GRIDS_PER_MEMBER = 20;
/** Ratings only count once a grid has this many (so one 5-star can't top the list). */
export const MIN_RATINGS_FOR_RANK = 3;

const cell = z.string().trim().min(1).max(30);
export const createGridSchema = z
  .object({
    title: z.string().trim().min(3).max(80),
    groups: z
      .array(z.object({ label: z.string().trim().min(2).max(40), items: z.array(cell).length(4) }))
      .length(4),
  })
  .superRefine((g, ctx) => {
    const items = g.groups.flatMap((x) => x.items.map((i) => i.toLowerCase()));
    if (new Set(items).size !== 16) {
      ctx.addIssue({ code: 'custom', message: 'All 16 items must be different', path: ['groups'] });
    }
    const labels = g.groups.map((x) => x.label.toLowerCase());
    if (new Set(labels).size !== 4) {
      ctx.addIssue({ code: 'custom', message: 'Group labels must be different', path: ['groups'] });
    }
  });
export type CreateGridInput = z.infer<typeof createGridSchema>;

export const guessSchema = z.object({ items: z.array(cell).length(4) });
export const rateSchema = z.object({ rating: z.number().int().min(1).max(5) });
export const scheduleSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export interface GridGroup {
  label: string;
  items: string[];
}

export interface GridSummary {
  id: string;
  title: string;
  author: { name: string | null; handle: string | null } | null;
  plays: number;
  solveRate: number | null;
  rating: number | null;
  ratingCount: number;
  dailyDate: string | null;
}

export interface GridPlayView extends GridSummary {
  /** The 16 items, in a stable shuffled order. */
  items: string[];
  isAuthor: boolean;
  found: { index: number; label: string; items: string[] }[];
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
export function shareText(
  title: string,
  view: Pick<GridPlayView, 'found' | 'mistakes' | 'status'>,
  url: string,
) {
  const sq = ['🟨', '🟩', '🟦', '🟪'];
  const rows = view.found.map((f) => sq[f.index % 4].repeat(4)).join('\n');
  const miss = '❌'.repeat(view.mistakes);
  return `RMHConnections "${title}" ${view.status === 'solved' ? '✅' : '💀'}\n${rows}${miss ? `\n${miss}` : ''}\n${url}`;
}

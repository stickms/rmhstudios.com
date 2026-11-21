/**
 * The bridge between the two notification preference stores, so one control can drive both.
 *
 * `NotificationPreference` carries six per-type columns (`likes`, `comments`, …) that `createNotification()` checks
 * for every notification, and the category × channel `matrix` that `dispatch()` reads. They used to have separate
 * controls (six switches on the settings index and on the notifications column, and the grid on
 * /settings/notifications), so the same "do I hear about likes" question was answered in three places that could
 * disagree. The grid is now the only control. These helpers keep the columns in step with it:
 *
 *  - saving the grid writes each column from its category's in-app channel (`columnsFromMatrix`);
 *  - reading the grid folds a column that is already off into its category (`foldColumnsIntoMatrix`), so a choice
 *    made with the old switches still shows, and is kept, in the grid;
 *  - the per-type API (kept for API clients) writes the category back too (`matrixFromColumns`).
 *
 * Client-safe: pure data, no Prisma.
 */

import { resolveChannels, type NotifyCategory, type NotifyMatrix } from './categories';

export type LegacyColumn = 'likes' | 'comments' | 'follows' | 'mentions' | 'reposts' | 'system';
export type LegacyColumns = Record<LegacyColumn, boolean>;

/** Which columns each category's in-app channel stands for. Categories absent here have no column. */
export const CATEGORY_COLUMNS: Partial<Record<NotifyCategory, readonly LegacyColumn[]>> = {
  social: ['likes', 'reposts'],
  replies: ['comments', 'mentions'],
  follows: ['follows'],
  system: ['system'],
};

/** The column values a saved matrix implies: each column is its category's effective in-app channel. */
export function columnsFromMatrix(matrix: NotifyMatrix): Partial<LegacyColumns> {
  const out: Partial<LegacyColumns> = {};
  for (const [category, columns] of Object.entries(CATEGORY_COLUMNS) as [NotifyCategory, readonly LegacyColumn[]][]) {
    const inapp = resolveChannels(matrix, category).inapp;
    for (const c of columns) out[c] = inapp;
  }
  return out;
}

/** The matrix as the grid should show it: a category is off in-app if any of its columns is off. */
export function foldColumnsIntoMatrix(
  matrix: NotifyMatrix,
  columns: Partial<LegacyColumns> | null | undefined,
): NotifyMatrix {
  if (!columns) return matrix;
  const next: NotifyMatrix = {
    ...matrix,
  };
  for (const [category, cols] of Object.entries(CATEGORY_COLUMNS) as [NotifyCategory, readonly LegacyColumn[]][]) {
    if (cols.some((c) => columns[c] === false)) {
      next[category] = {
        ...next[category],
        inapp: false,
      };
    }
  }
  return next;
}

/** After a per-type column write: set each touched category's in-app channel to "all its columns are on". */
export function matrixFromColumns(matrix: NotifyMatrix, columns: LegacyColumns): NotifyMatrix {
  const next: NotifyMatrix = {
    ...matrix,
  };
  for (const [category, cols] of Object.entries(CATEGORY_COLUMNS) as [NotifyCategory, readonly LegacyColumn[]][]) {
    next[category] = {
      ...next[category],
      inapp: cols.every((c) => columns[c]),
    };
  }
  return next;
}
